import { useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import type { DetectedBidSection } from '../types';

interface BidSectionSelectorDialogProps {
  open: boolean;
  sections: DetectedBidSection[];
  totalDeclared?: number | null;
  onSelect: (sectionIds: string[]) => void;
  onCancel: () => void;
  busy?: boolean;
}

function BidSectionSelectorDialog({
  open,
  sections,
  totalDeclared,
  onSelect,
  onCancel,
  busy,
}: BidSectionSelectorDialogProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>(() => (sections[0]?.id ? [sections[0].id] : []));

  useEffect(() => {
    setSelectedIds(open && sections[0]?.id ? [sections[0].id] : []);
  }, [open, sections]);

  const allIds = useMemo(() => sections.map((section) => section.id), [sections]);
  const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.includes(id));

  const toggleId = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const toggleAll = () => {
    setSelectedIds(allSelected ? [] : allIds);
  };

  const declaredLabel = totalDeclared ? `${totalDeclared} 个` : `${sections.length} 个`;
  const selectedCount = selectedIds.length;

  const handleConfirm = () => {
    // 按 sections 原始顺序返回，保证主标段（第一个）稳定，不受勾选顺序影响
    onSelect(allIds.filter((id) => selectedIds.includes(id)));
  };

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => { if (!nextOpen && !busy) onCancel(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="content-regenerate-modal" />
        <Dialog.Content className="bid-section-selector-card">
          <Dialog.Title className="sr-only">选择投标范围</Dialog.Title>
          <Dialog.Description className="sr-only">检测到招标文件包含多个标段或包，请选择本次投标范围，可多选。</Dialog.Description>

          <div className="bid-section-selector-head">
            <h2>选择投标范围</h2>
            <p>检测到本招标文件共包含 <strong>{declaredLabel}</strong>，请勾选您要投标的范围（<strong>可多选</strong>）。后续解析和生成将聚焦于所选范围相关内容。</p>
          </div>

          <div className="bid-section-selector-toolbar">
            <button
              type="button"
              className="bid-section-selectall"
              onClick={toggleAll}
              disabled={busy || allIds.length === 0}
            >
              {allSelected ? '取消全选' : '全选'}
            </button>
            <span className="bid-section-selected-count">已选 {selectedCount} / {sections.length}</span>
          </div>

          <div className="bid-section-selector-list" role="group" aria-label="投标范围列表">
            {sections.map((section) => {
              const isSelected = selectedIds.includes(section.id);
              return (
                <button
                  key={section.id}
                  type="button"
                  className={`bid-section-card${isSelected ? ' is-active' : ''}`}
                  onClick={() => toggleId(section.id)}
                  disabled={busy}
                  role="checkbox"
                  aria-checked={isSelected}
                >
                  <div className="bid-section-card-head">
                    <span className="bid-section-card-index">{section.title}</span>
                    {isSelected && <span className="bid-section-card-check">✓</span>}
                  </div>
                  {section.headLine && (
                    <p className="bid-section-card-headline">{section.headLine}</p>
                  )}
                  {section.description && section.description !== section.headLine && (
                    <p className="bid-section-card-description">{section.description}</p>
                  )}
                </button>
              );
            })}
          </div>

          <div className="bid-section-selector-actions">
            <Dialog.Close className="secondary-action" type="button" disabled={busy}>取消</Dialog.Close>
            <button
              type="button"
              className="primary-action"
              onClick={handleConfirm}
              disabled={busy || selectedCount === 0}
            >
              {busy ? '导入中...' : `确认导入${selectedCount > 1 ? `（${selectedCount} 个）` : ''}`}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default BidSectionSelectorDialog;
