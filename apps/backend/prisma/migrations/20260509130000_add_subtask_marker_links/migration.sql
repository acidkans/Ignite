CREATE TABLE "subtask_marker_links" (
    "id"        TEXT NOT NULL,
    "subtaskId" TEXT NOT NULL,
    "markerId"  TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "subtask_marker_links_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "subtask_marker_links_subtaskId_fkey" FOREIGN KEY ("subtaskId") REFERENCES "subtasks"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "subtask_marker_links_markerId_fkey" FOREIGN KEY ("markerId") REFERENCES "schematic_markers"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "subtask_marker_links_subtaskId_markerId_key" ON "subtask_marker_links"("subtaskId", "markerId");
CREATE INDEX "subtask_marker_links_subtaskId_idx" ON "subtask_marker_links"("subtaskId");
