import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';
import { NotificationsService } from './notifications.service';
import { NotificationSettingsService } from '../notification-settings/notification-settings.service';

// @anchor extra-order-status — kod statusu wyzwalającego powiadomienie. Lustro
// `EXTRA_ORDER` z frontendowego `STRUCTURE_STATUS_META`; backend nie ma whitelisty
// statusów, więc to jedyne miejsce, w którym ten kod ma po stronie serwera znaczenie.
export const EXTRA_ORDER_STATUS = 'EXTRA_ORDER';

// @anchor extra-order-notification-type — typ wpisu w dzwonku. Służy TAKŻE za znacznik
// deduplikacji: „raz na zamówienie" sprawdzamy zapytaniem o istniejący wpis tego typu.
export const EXTRA_ORDER_NOTIFICATION_TYPE = 'EXTRA_ORDER';

/**
 * Powiadamia logistyków o pierwszej pozycji, która w danym zamówieniu weszła w status
 * „Dodatkowe zamówienie".
 *
 * Trzy rzeczy, które ta klasa rozstrzyga i które łatwo zrobić źle:
 *
 * 1. RAZ NA ZAMÓWIENIE, nie raz na pozycję. Domówienie idzie zwykle serią — brakło
 *    dziesięciu rzeczy z jednej dostawy — i push per pozycja zamieniłby kanał w spam,
 *    którego logistyk przestanie czytać. Znacznikiem jest istniejący wpis `Notification`
 *    typu EXTRA_ORDER dla tego `orderId`, więc próg przeżywa restart backendu bez
 *    dokładania kolumny do schematu.
 * 2. ODPORNOŚĆ NA PODWÓJNY ZAPIS. UI zapisuje ten status DWOMA żądaniami — na
 *    `/wbs-nodes/:id` i na `/material-requirements/:id` — więc oba wołają tę metodę.
 *    Warunek z punktu 1 załatwia to przy okazji: drugie wywołanie widzi już wpis.
 * 3. BRAK ODBIORCÓW TO NIE JEST WYSŁANE. Gdy nikt nie pasuje, świadomie NIE zostawiamy
 *    wpisu — inaczej próg zamknąłby się na zamówieniu, o którym nikt się nie dowiedział,
 *    i późniejsze nadanie uprawnień logistykowi już nic by nie dało.
 */
@Injectable()
export class ExtraOrderNotifierService {
    private readonly logger = new Logger(ExtraOrderNotifierService.name);

    constructor(
        private prisma: PrismaService,
        private push: PushService,
        private notifications: NotificationsService,
        // Moduł ustawień jest @Global, więc wstrzykuje się bez importu w NotificationsModule.
        private settings: NotificationSettingsService,
    ) {}

    // @anchor extra-order-resolve-order-node — wspina się po drzewie do węzła `type='order'`.
    // Pozycje WBS wiszą na zamówieniu, ale karta materiałowa bywa podpięta pod obiekt (`site`),
    // a powiadomienie ma prowadzić do zamówienia — to jego listę materiałową otwiera link.
    private async resolveOrderNodeId(nodeId: string): Promise<string | null> {
        let currentId = nodeId;
        for (let i = 0; i < 10; i++) {
            const node = await this.prisma.processNode.findUnique({
                where: { id: currentId },
                select: { id: true, type: true, parentId: true },
            });
            if (!node) return null;
            if (String(node.type || '').toLowerCase() === 'order') return node.id;
            if (!node.parentId) return null;
            currentId = node.parentId;
        }
        return null;
    }

    // @anchor extra-order-logisticians — „logistyk przypisany do węzła" = aktywny użytkownik
    // z rolą LOGISTYK, który ma dostęp do tego zamówienia LUB do któregoś z jego przodków,
    // bezpośrednio albo przez zespół.
    //
    // Dwie rzeczy sprawdzone na danych, nie założone:
    //
    // 1. DZIEDZICZENIE PO PRZODKACH jest konieczne — uprawnienia nadaje się na kliencie albo
    //    obszarze („AMP", „T-KOM"), nie na każdym zamówieniu z osobna. Ta sama reguła, po
    //    której `checkAncestorAccess` wpuszcza użytkownika do drzewa.
    // 2. ZESPÓŁ jest konieczny, i to on tu decyduje. Na bazie dev z 34 zamówieniami reguła
    //    licząca wyłącznie `NodePermission.userId` dawała ZERO odbiorców: user-owe wpisy na
    //    zamówieniach to prawie wyłącznie kontakty zewnętrzne (rola USER) dodawane przez
    //    `addProjectContact`, a etatowy logistyk dostaje dostęp przez zespół („Services",
    //    „Systems"). Bez tej gałęzi powiadomienie kompilowałoby się, przechodziło testy
    //    i nigdy nie doszło do nikogo.
    private async logisticiansForOrder(orderNodeId: string) {
        const ancestors = await this.prisma.processNodeClosure.findMany({
            where: { descendantId: orderNodeId },
            select: { ancestorId: true },
        });
        const nodeIds = Array.from(new Set([orderNodeId, ...ancestors.map(a => a.ancestorId)]));

        return this.prisma.user.findMany({
            where: {
                isActive: true,
                userRoles: { some: { role: { name: 'LOGISTYK' } } },
                OR: [
                    { nodePermissions: { some: { nodeId: { in: nodeIds } } } },
                    { teams: { some: { nodePermissions: { some: { nodeId: { in: nodeIds } } } } } },
                ],
            },
            select: { id: true, email: true },
        });
    }

    // @anchor notify-extra-order
    async notify(input: { processNodeId?: string | null; positionName?: string | null; requirementId?: string | null }) {
        if (!input.processNodeId) return;

        const orderNodeId = await this.resolveOrderNodeId(input.processNodeId);
        if (!orderNodeId) return;

        const already = await this.prisma.notification.findFirst({
            where: { type: EXTRA_ORDER_NOTIFICATION_TYPE, orderId: orderNodeId },
            select: { id: true },
        });
        if (already) return;

        const recipients = await this.logisticiansForOrder(orderNodeId);
        if (recipients.length === 0) {
            this.logger.warn(`[ExtraOrder] zamówienie ${orderNodeId}: brak logistyka z uprawnieniem — nikogo nie powiadamiam`);
            return;
        }

        const order = await this.prisma.processNode.findUnique({
            where: { id: orderNodeId },
            select: { name: true },
        });
        const position = String(input.positionName || '').trim();
        const title = '📦 Dodatkowe zamówienie';
        const body = position
            ? `${order?.name || 'Zamówienie'}: „${position}" wymaga domówienia. Otwórz listę materiałową.`
            : `${order?.name || 'Zamówienie'}: pozycja wymaga domówienia. Otwórz listę materiałową.`;

        const pushEnabled = (await this.settings.getOrCreate().catch(() => null))?.webPushEnabled ?? true;
        this.logger.log(`[ExtraOrder] zamówienie ${orderNodeId} („${order?.name}") → ${recipients.length} logistyk(ów), push=${pushEnabled}`);

        for (const user of recipients) {
            // Wpis w dzwonku PRZED pushem: to on jest progiem z punktu 1, a push bywa
            // odrzucony przez przeglądarkę i nie może decydować o tym, czy próg się zamknął.
            await this.notifications.create(
                user.id,
                EXTRA_ORDER_NOTIFICATION_TYPE,
                title,
                body,
                orderNodeId,
                input.requirementId ?? undefined,
            ).catch((err: any) => this.logger.warn(`[ExtraOrder] wpis dla ${user.email} nie powstał: ${err?.message}`));

            // Globalny wyłącznik gasi WYŁĄCZNIE pusha — wpis w dzwonku zostaje, bo to osobny
            // kanał i wyłączenie Web Push nie znaczy „nie informuj mnie w ogóle".
            if (!pushEnabled) continue;

            // `tab` + `section` prowadzą kliknięcie prosto w WBS → Materiały tego zamówienia;
            // sam `orderId` otworzyłby zamówienie na ostatnio oglądanej zakładce.
            await this.push.sendToUser(user.id, title, body, orderNodeId, {
                type: EXTRA_ORDER_NOTIFICATION_TYPE,
                tab: 'unified',
                section: 'materials',
            }).catch((err: any) => this.logger.warn(`[ExtraOrder] push do ${user.email} nie poszedł: ${err?.message}`));
        }
    }
}
