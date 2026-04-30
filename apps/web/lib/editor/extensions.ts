import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table';

export function articleEditorExtensions(options: { openLinksOnClick?: boolean } = {}) {
  return [
    StarterKit,
    Image,
    Link.configure({ openOnClick: options.openLinksOnClick ?? false }),
    Table.configure({ resizable: false }),
    TableRow,
    TableCell,
    TableHeader,
  ];
}
