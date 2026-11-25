-- 업무를 프로젝트에 직접 단다.
--
-- 업무의 다른 연결 칸(연락처·의뢰·거래)으로는 대표 고객도 의뢰도 없는 빈 프로젝트에 업무를 적을 수 없다.
-- 프로젝트는 빈 채로도 여는 작업 공간이므로 프로젝트를 직접 가리키는 칸을 둔다.
--
-- (office_id, project_id) 조합 FK라 다른 사무소의 프로젝트를 가리킬 수 없다. project_id가 비어 있으면
-- 검사하지 않는다(MATCH SIMPLE). 프로젝트를 풀 때는 서비스가 이 칸을 먼저 비운다 — 업무는 남는다.

ALTER TABLE "tasks" ADD COLUMN "project_id" UUID;

CREATE INDEX "tasks_office_id_project_id_idx" ON "tasks"("office_id", "project_id");

ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_office_id_project_id_fkey"
  FOREIGN KEY ("office_id", "project_id") REFERENCES "projects"("office_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
