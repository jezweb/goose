import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { Button } from '../../ui/button';
import { defineMessages, useIntl } from '../../../i18n';

const i18n = defineMessages({
  newFolderTitle: {
    id: 'folderNameDialog.newFolderTitle',
    defaultMessage: 'New folder',
  },
  renameFolderTitle: {
    id: 'folderNameDialog.renameFolderTitle',
    defaultMessage: 'Rename folder',
  },
  placeholder: {
    id: 'folderNameDialog.placeholder',
    defaultMessage: 'Folder name',
  },
  cancel: {
    id: 'folderNameDialog.cancel',
    defaultMessage: 'Cancel',
  },
  create: {
    id: 'folderNameDialog.create',
    defaultMessage: 'Create',
  },
  rename: {
    id: 'folderNameDialog.rename',
    defaultMessage: 'Rename',
  },
});

export type FolderDialogMode = 'create' | 'rename';

interface FolderNameDialogProps {
  open: boolean;
  mode: FolderDialogMode;
  initialName?: string;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}

export function FolderNameDialog({
  open,
  mode,
  initialName = '',
  onConfirm,
  onCancel,
}: FolderNameDialogProps) {
  const intl = useIntl();
  const [name, setName] = useState(initialName);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset value + focus when the dialog opens
  useEffect(() => {
    if (open) {
      setName(initialName);
      // Defer focus until after the dialog has rendered
      const id = window.setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [open, initialName]);

  const trimmed = name.trim();
  const canSubmit = trimmed.length > 0 && trimmed !== initialName.trim();

  const handleSubmit = () => {
    if (!canSubmit) return;
    onConfirm(trimmed);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {intl.formatMessage(mode === 'create' ? i18n.newFolderTitle : i18n.renameFolderTitle)}
          </DialogTitle>
        </DialogHeader>
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleSubmit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              onCancel();
            }
          }}
          placeholder={intl.formatMessage(i18n.placeholder)}
          maxLength={80}
          className="w-full px-3 py-2 rounded-md border bg-background-primary text-text-primary border-border-primary focus:outline-none focus:ring-2 focus:ring-blue-500/40"
        />
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            {intl.formatMessage(i18n.cancel)}
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {intl.formatMessage(mode === 'create' ? i18n.create : i18n.rename)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
