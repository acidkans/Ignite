import { MaterialRequirementsService } from '../apps/backend/src/material-requirements/material-requirements.service';

// Guard `nodeShareFromDto` nie dotyka prisma ani żadnej innej zależności — konstruktor karmimy
// nullami, żeby test dotyczył PRAWDZIWEJ metody serwisu, nie jej kopii.
const svc = new MaterialRequirementsService(
    null as any, null as any, null as any, null as any, null as any, null as any,
);
const share = (nodeId: string, qty: number, allocJson?: string | null) =>
    (svc as any).nodeShareFromDto(nodeId, qty, allocJson);

const THIS_NODE = '77256cc1-29b9-4c33-8aea-a08d4ab7f2a3';
const OTHER_NODE = '646f38e9-7fa3-4638-a9d7-bebd957e7bb2';

describe('nodeShareFromDto — węzeł WBS nigdy nie dostaje sumy alokacji', () => {
    it('regresja AMP5G: mapa z cudzą alokacją 1 → węzeł dostaje 450, nie 451', () => {
        const alloc = JSON.stringify({ [OTHER_NODE]: 1, [THIS_NODE]: 450 });
        expect(share(THIS_NODE, 451, alloc)).toBe(450);
    });

    it('mapa bez tego węzła → null, czyli nie ruszamy węzła', () => {
        const alloc = JSON.stringify({ [OTHER_NODE]: 1 });
        expect(share(THIS_NODE, 451, alloc)).toBeNull();
    });

    it('PATCH bez mapy → przysłana ilość dotyczy tego jednego węzła', () => {
        expect(share(THIS_NODE, 450, undefined)).toBe(450);
        expect(share(THIS_NODE, 450, null)).toBe(450);
    });

    it('mapa jednowpisowa → wartość z mapy', () => {
        expect(share(THIS_NODE, 450, JSON.stringify({ [THIS_NODE]: 450 }))).toBe(450);
    });

    it('zepsuty JSON → zachowanie jak bez mapy', () => {
        expect(share(THIS_NODE, 450, '{nie-json')).toBe(450);
    });

    it('ujemny lub nieliczbowy udział → null', () => {
        expect(share(THIS_NODE, 450, JSON.stringify({ [THIS_NODE]: -5 }))).toBeNull();
        expect(share(THIS_NODE, 450, JSON.stringify({ [THIS_NODE]: 'abc' }))).toBeNull();
    });

    it('zero to prawidłowy udział, nie brak wartości', () => {
        expect(share(THIS_NODE, 450, JSON.stringify({ [OTHER_NODE]: 450, [THIS_NODE]: 0 }))).toBe(0);
    });
});
