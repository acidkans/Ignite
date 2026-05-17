# CHANGELOG — Ignite ERP

Zmiany strukturalne: schemat bazy, architektura, API. Bugfixy i refaktory nie są tu zapisywane.

---

## 2026-05-17

### schema.prisma — stan bazowy (dokumentacja)
- Model `ProcessNode` — drzewo firmy: `type` enum `area|field|order|site`
- Model `ProcessNodeClosure` — tabela domknięcia dla szybkich zapytań przodek/potomek
- Model `WbsNode` — drzewo WBS wewnątrz zlecenia, pola budżetowe: `unitCost`, `quantity`, `totalCost`, `margin`, `discount`, `unitPrice`, `totalPrice`
- Model `WbsNodeMaterial` — alokacja materiału do węzła WBS (many-to-many z `quantity`)
- Model `MaterialRequirement` — wymaganie materiałowe; pole `wbsNodeId` @unique (karta produktowa 1:1 z WbsNode)
- Model `MaterialRequirementsList` — lista wymagań z wersjonowaniem (`parentId` FK do siebie)
- Model `Subtask` — zadania; pola `isAiGenerated`, `isApproved`, `requirementItemId`
- Model `ProjectVersion` — wersje projektu; `isActive: Boolean`
- Model `OrderRequirements` — wymagania ofertowe; `clientProjectManager`, `offerStatus`, `wbsTree`
- Model `Site` — dane lokalizacji 1:1 z ProcessNode; `customData: Json`
- Model `SchematicMarker` — markery na schemacie; typ `POINT|LINE`, pola `x,y,x2?,y2?`
- Model `WbsMarkerLink` / `SubtaskMarkerLink` — powiązania markera z WbsNode i Subtask
- Model `DocumentHighlight` — zaznaczenia w dokumentach PDF; `rects: Json`, `color`
- Model `ProductProposal` — propozycje produktów AI/ręczne; `matchScore`, `isSelected`, `isRejected`
- Model `Comment` — komentarze do zleceń; `type: NOTE|QUESTION|RESOLVED|URGENT`, `mentionedUserIds[]`
- Model `Notification` / `PushSubscription` — powiadomienia push
