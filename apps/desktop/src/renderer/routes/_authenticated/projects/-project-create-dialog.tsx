import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { Contact, CreateProjectDto, ProjectPlan } from "@estate-erp/api-client";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { announceProjectChange } from "@/lib/project-sync";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ContactPicker } from "../deals/-deal-shared";

const NO_ASSIGNEE = "none";

/**
 * 프로젝트 열기.
 *
 * 누구의 일인지(대표 고객)만 정하면 열린다. 의뢰는 연 뒤에 진행 계획에서 담는다 —
 * 서버가 그 손님의 의뢰를 알아서 담지 않는다.
 */
export function ProjectCreateDialog({
  open,
  onOpenChange,
  assigneeOptions,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assigneeOptions: ReadonlyArray<{ value: string; label: string }>;
  onCreated: (project: ProjectPlan) => void | Promise<void>;
}) {
  const [contact, setContact] = useState<Contact | null>(null);
  const [title, setTitle] = useState("");
  const [assigneeId, setAssigneeId] = useState(NO_ASSIGNEE);

  // 다시 열면 빈 칸으로 시작한다. 닫히는 동안에는 적은 것이 보이는 채로 사라진다.
  useEffect(() => {
    if (!open) return;
    setContact(null);
    setTitle("");
    setAssigneeId(NO_ASSIGNEE);
  }, [open]);

  // 보낼 값은 누른 순간의 것을 요청에 담는다. 요청이 기다리는 동안 칸을 고쳐도 보낸 값이 바뀌지 않는다.
  const create = useMutation({
    mutationFn: (dto: CreateProjectDto) => api.projects.create(dto),
    onSuccess: async (project) => {
      announceProjectChange("changed", project.id);
      await onCreated(project);
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : "프로젝트를 열지 못했습니다.",
      );
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // 저장하는 중에는 닫지 않는다(닫으면 열린 프로젝트를 놓친다).
        if (!create.isPending) onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>프로젝트 열기</DialogTitle>
          <DialogDescription>
            한 손님과 계속 주고받을 일을 한곳에 모읍니다. 의뢰는 연 뒤에 담습니다.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!contact || create.isPending) return;
            create.mutate({
              primaryContactId: contact.id,
              title: title.trim() || null,
              assignedToId: assigneeId === NO_ASSIGNEE ? null : assigneeId,
            });
          }}
        >
          <div className="space-y-1.5">
            <span className="text-sm font-medium" id="project-create-contact">
              대표 고객
            </span>
            <div aria-labelledby="project-create-contact">
              <ContactPicker value={contact} onChange={setContact} />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="project-create-title">
              프로젝트 이름
            </label>
            <Input
              id="project-create-title"
              value={title}
              maxLength={100}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={contact ? `${contact.name}님 프로젝트` : "비워 두면 손님 이름으로 부릅니다"}
            />
          </div>
          <div className="space-y-1.5">
            <span className="text-sm font-medium" id="project-create-assignee">
              담당
            </span>
            <Select value={assigneeId} onValueChange={setAssigneeId}>
              <SelectTrigger aria-labelledby="project-create-assignee" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_ASSIGNEE}>담당 없음</SelectItem>
                {assigneeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={create.isPending}
              onClick={() => onOpenChange(false)}
            >
              취소
            </Button>
            <Button type="submit" disabled={!contact || create.isPending}>
              {create.isPending ? "여는 중" : "프로젝트 열기"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
