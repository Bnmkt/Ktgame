export const koinStatusLabel = (value) =>
  ({
    pending: "En attente",
    delivered: "Livré",
    failed: "Échec",
    cancelled: "Annulé",
    refunded: "Remboursé",
    partially_refunded: "Remboursement partiel",
    done: "Terminé",
  })[value] ?? value;
export const koinDocumentLabel = (value) =>
  ({
    free_receipt: "Justificatif d’attribution gratuite",
    allocation_receipt: "Justificatif d’attribution",
    refund_receipt: "Justificatif de remboursement",
    provider_invoice: "Facture fournisseur",
    provider_credit_note: "Avoir fournisseur",
  })[value] ?? value;
export const koinTransactionLabel = (value) =>
  ({
    purchase: "Achat de Koins",
    code: "Code gratuit",
    cosmetics: "Achat cosmétique",
    refund: "Remboursement",
  })[value] ?? value;
