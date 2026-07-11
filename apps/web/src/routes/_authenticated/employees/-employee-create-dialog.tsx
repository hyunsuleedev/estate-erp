import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import type { CreateEmployeeDto } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  LICENSE_TYPE_LABELS,
  NONE_VALUE,
  getErrorMessage,
  roleMeta,
} from './-employee-shared';

interface CreateFormState {
  name: string;
  loginId: string;
  phone: string;
  email: string;
  role: string;
  password: string;
  licenseType: string;
  licenseNo: string;
}

const EMPTY_FORM: CreateFormState = {
  name: '',
  loginId: '',
  phone: '',
  email: '',
  role: 'agent',
  password: '',
  licenseType: '',
  licenseNo: '',
};

export function EmployeeCreateDialog({
  open,
  onOpenChange,
  actorRole,
  activeUserCount,
  maxUsers,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actorRole: string;
  activeUserCount: number;
  maxUsers: number | null;
  onCreated: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CreateFormState>(EMPTY_FORM);

  // 생성: manager는 agent만, owner는 agent/manager
  const roleOptions = actorRole === 'owner' ? ['agent', 'manager'] : ['agent'];
  const isSlotFull = maxUsers != null && activeUserCount >= maxUsers;

  const createMutation = useMutation({
    mutationFn: (payload: CreateEmployeeDto) => api.employees.create(payload),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['office-profile'] });
      onOpenChange(false);
      setForm(EMPTY_FORM);
      onCreated(created.id);
      toast.success(`${created.name}님 계정이 생성되었습니다.`);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const set = (patch: Partial<CreateFormState>) =>
    setForm((prev) => ({ ...prev, ...patch }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>새 직원</DialogTitle>
          <DialogDescription>
            직원이 사용할 로그인 ID와 초기 비밀번호를 입력합니다.
            {maxUsers != null ? ` 슬롯 ${activeUserCount}/${maxUsers} 사용 중.` : ''}
          </DialogDescription>
        </DialogHeader>

        {isSlotFull ? (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertDescription>
              최대 사용자 수({maxUsers}명)에 도달했습니다. 직원을 비활성화하거나 플랜을
              업그레이드한 후 추가하세요.
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
          <CreateField label="이름" required>
            <Input
              value={form.name}
              onChange={(event) => set({ name: event.target.value })}
              placeholder="홍길동"
              autoFocus
            />
          </CreateField>
          <CreateField label="로그인 ID" required>
            <Input
              value={form.loginId}
              onChange={(event) => set({ loginId: event.target.value })}
              placeholder="예: hong123"
            />
          </CreateField>
          <CreateField label="초기 비밀번호" required>
            <Input
              type="password"
              value={form.password}
              onChange={(event) => set({ password: event.target.value })}
            />
          </CreateField>
          <CreateField label="역할">
            <Select value={form.role} onValueChange={(value) => set({ role: value })}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="역할 선택" />
              </SelectTrigger>
              <SelectContent>
                {roleOptions.map((role) => (
                  <SelectItem key={role} value={role}>
                    {roleMeta[role]?.label ?? role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CreateField>
          <CreateField label="휴대폰">
            <Input
              value={form.phone}
              onChange={(event) => set({ phone: event.target.value })}
              placeholder="010-0000-0000"
            />
          </CreateField>
          <CreateField label="이메일">
            <Input
              value={form.email}
              onChange={(event) => set({ email: event.target.value })}
              placeholder="선택 입력"
            />
          </CreateField>
          <CreateField label="자격 구분">
            <Select
              value={form.licenseType || NONE_VALUE}
              onValueChange={(value) =>
                set({ licenseType: value === NONE_VALUE ? '' : value })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="자격 구분" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>미지정</SelectItem>
                {Object.entries(LICENSE_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CreateField>
          <CreateField label="자격증/등록 번호">
            <Input
              value={form.licenseNo}
              onChange={(event) => set({ licenseNo: event.target.value })}
              placeholder="선택 입력"
            />
          </CreateField>
        </div>
        {form.licenseType === 'assistant' ? (
          <p className="text-xs text-warning">중개보조원은 계약서에 서명할 수 없습니다.</p>
        ) : null}

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={createMutation.isPending}
          >
            취소
          </Button>
          <Button
            onClick={() =>
              createMutation.mutate({
                name: form.name.trim(),
                loginId: form.loginId.trim(),
                phone: form.phone.trim() || undefined,
                email: form.email.trim() || undefined,
                role: form.role,
                password: form.password,
                licenseType: form.licenseType || null,
                licenseNo: form.licenseNo.trim() || null,
              })
            }
            disabled={
              createMutation.isPending ||
              isSlotFull ||
              !form.name.trim() ||
              !form.loginId.trim() ||
              !form.password.trim()
            }
          >
            생성
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      {children}
    </div>
  );
}
