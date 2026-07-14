/**
 * RichTextEditor — 계약 특약사항(레거시 Rider_Part HTML) 편집용 TipTap 에디터.
 *
 * - 값은 HTML 문자열. 비어 있으면 '' 를 emit 한다.
 * - 레거시 plain text 값(기존 Textarea 저장분)은 자동으로 문단 HTML 로 변환해 표시한다.
 * - 들어오는 값은 항상 새니타이즈 후 에디터에 주입한다 (contractRichTextToSafeHtml).
 * - 툴바는 레거시 특약 수준 최소 셋: 굵게/기울임/밑줄/취소선/글머리기호/번호목록.
 * - StarterKit 에서 heading/code 등 허용 외 노드를 꺼서 출력 HTML 이
 *   CONTRACT_RICH_TEXT_ALLOWED_TAGS 화이트리스트 안에 머물게 한다.
 *
 * apps/desktop/src/renderer/components/rich-text-editor.tsx 와 동일 구현 —
 * shared 패키지는 React 컴포넌트를 두지 않는 관례라 앱별로 복제한다.
 * 이 파일은 '@/lib/contract-rich-text'(새니타이즈 헬퍼)와 shadcn 스타일 토큰만 사용한다.
 */
import { useEffect, useRef } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Strikethrough,
  Underline,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  CONTRACT_RICH_TEXT_VIEW_CLASS,
  contractRichTextToSafeHtml,
} from '@/lib/contract-rich-text';

type RichTextEditorProps = {
  /** HTML 문자열 (레거시 plain text 도 허용 — 자동 변환) */
  value: string;
  /** 사용자가 편집할 때 HTML emit (빈 문서는 '') */
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  /** 본문 최소 높이 (기본 h-28 상당) */
  contentMinHeightClassName?: string;
};

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  className,
  contentMinHeightClassName = 'min-h-28',
}: RichTextEditorProps) {
  // 이 에디터가 마지막으로 emit 한 값 — 외부 변경(특약 가져오기 등)과 구분
  const lastEmittedRef = useRef<string | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // 허용 태그 화이트리스트(p/br/strong/em/u/s/ul/ol/li) 밖 노드는 비활성화
        heading: false,
        blockquote: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        link: false,
      }),
    ],
    content: contractRichTextToSafeHtml(value),
    editorProps: {
      attributes: {
        class: cn(
          'px-3 py-2 text-base outline-none md:text-sm leading-6',
          CONTRACT_RICH_TEXT_VIEW_CLASS,
          contentMinHeightClassName,
        ),
      },
    },
    shouldRerenderOnTransaction: false,
    onUpdate: ({ editor: current }) => {
      const html = current.isEmpty ? '' : current.getHTML();
      lastEmittedRef.current = html;
      onChange(html);
    },
  });

  // 외부에서 value 가 바뀌면 (템플릿 삽입, 폼 리셋 등) 에디터에 반영
  useEffect(() => {
    if (!editor || value === lastEmittedRef.current) return;
    const incoming = contractRichTextToSafeHtml(value);
    const current = editor.isEmpty ? '' : editor.getHTML();
    if (incoming !== current) {
      editor.commands.setContent(incoming, { emitUpdate: false });
    }
    lastEmittedRef.current = value;
  }, [editor, value]);

  const activeMarks = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current?.isActive('bold') ?? false,
      italic: current?.isActive('italic') ?? false,
      underline: current?.isActive('underline') ?? false,
      strike: current?.isActive('strike') ?? false,
      bulletList: current?.isActive('bulletList') ?? false,
      orderedList: current?.isActive('orderedList') ?? false,
    }),
  });

  const isEmpty = !value;

  return (
    <div
      className={cn(
        'rounded-md border border-input bg-transparent shadow-xs transition-[color,box-shadow]',
        'focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50',
        'dark:bg-input/30',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border/60 px-1.5 py-1">
        <ToolbarButton
          icon={Bold}
          label="굵게"
          isActive={activeMarks?.bold}
          onToggle={() => editor?.chain().focus().toggleBold().run()}
        />
        <ToolbarButton
          icon={Italic}
          label="기울임"
          isActive={activeMarks?.italic}
          onToggle={() => editor?.chain().focus().toggleItalic().run()}
        />
        <ToolbarButton
          icon={Underline}
          label="밑줄"
          isActive={activeMarks?.underline}
          onToggle={() => editor?.chain().focus().toggleUnderline().run()}
        />
        <ToolbarButton
          icon={Strikethrough}
          label="취소선"
          isActive={activeMarks?.strike}
          onToggle={() => editor?.chain().focus().toggleStrike().run()}
        />
        <div className="mx-1 h-4 w-px bg-border" />
        <ToolbarButton
          icon={List}
          label="글머리 기호"
          isActive={activeMarks?.bulletList}
          onToggle={() => editor?.chain().focus().toggleBulletList().run()}
        />
        <ToolbarButton
          icon={ListOrdered}
          label="번호 목록"
          isActive={activeMarks?.orderedList}
          onToggle={() => editor?.chain().focus().toggleOrderedList().run()}
        />
      </div>
      <div className="relative">
        {isEmpty && placeholder ? (
          <p className="pointer-events-none absolute left-3 top-2 text-base text-muted-foreground md:text-sm">
            {placeholder}
          </p>
        ) : null}
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function ToolbarButton({
  icon: Icon,
  label,
  isActive,
  onToggle,
}: {
  icon: LucideIcon;
  label: string;
  isActive?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={isActive === true}
      // 클릭 시 에디터 포커스/선택이 풀리지 않도록 mousedown 을 막는다
      onMouseDown={(event) => event.preventDefault()}
      onClick={onToggle}
      className={cn(
        'inline-flex size-7 items-center justify-center rounded-sm text-muted-foreground transition-colors',
        'hover:bg-muted hover:text-foreground',
        isActive && 'bg-muted text-foreground',
      )}
    >
      <Icon className="size-3.5" />
    </button>
  );
}
