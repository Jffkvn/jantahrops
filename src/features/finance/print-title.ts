import type { DocumentType } from '@/types/database';

/**
 * The document title shown on the print view.
 * Invoices are "Tax Invoice" when the company is VAT-registered.
 */
export function documentTitleFor(type: DocumentType, vatRegistered: boolean): string {
  switch (type) {
    case 'invoice':
      return vatRegistered ? 'Tax Invoice' : 'Invoice';
    case 'quote':
      return 'Quotation';
    case 'lpo':
      return 'Local Purchase Order';
    case 'receipt':
      return 'Receipt';
  }
}
