import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  Check,
  FileSpreadsheet,
  FileText,
  Upload,
  X,
} from 'lucide-react';
import {
  BankCard,
  CardCurrency,
  CustomCategory,
  Transaction,
} from '../../types';
import { formatMoney } from '../../data/defaults';
import {
  FxRatesToAmd,
  convertFromAMD,
  formatCardLabel,
  formatCardMoney,
  getDefaultCard,
  normalizeCardCurrency,
} from '../../utils/cardBalances';
import {
  mergeExpenseCategories,
  mergeIncomeCategories,
} from '../../utils/customCategories';
import {
  ParsedCsvTable,
  StatementColumnMapping,
  StatementPreviewRow,
  buildStatementPreviewRows,
  detectStatementColumns,
  parseCsvRows,
} from '../../utils/statementImporter';

interface StatementImportModalProps {
  cards: BankCard[];
  transactions: Transaction[];
  customCategories?: CustomCategory[];
  fxRates?: FxRatesToAmd | null;
  onClose: () => void;
  onImportTransactions: (
    items: Array<Omit<Transaction, 'id' | 'createdAt'>>
  ) => void;
}

export function StatementImportModal({
  cards,
  transactions,
  customCategories = [],
  fxRates,
  onClose,
  onImportTransactions,
}: StatementImportModalProps) {
  const prefersReducedMotion = useReducedMotion();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [inputMode, setInputMode] = useState<'file' | 'paste'>('file');
  const [rawText, setRawText] = useState('');
  const [fileName, setFileName] = useState('');
  const [selectedCardId, setSelectedCardId] = useState<string>(
    () => getDefaultCard(cards)?.id ?? ''
  );
  const [mappingOverride, setMappingOverride] =
    useState<StatementColumnMapping | null>(null);
  const [selectedOverrides, setSelectedOverrides] = useState<
    Record<string, boolean>
  >({});
  const [categoryOverrides, setCategoryOverrides] = useState<
    Record<string, string>
  >({});
  const [error, setError] = useState('');

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const parsedTable: ParsedCsvTable | null = useMemo(() => {
    if (!rawText.trim()) return null;
    const table = parseCsvRows(rawText);
    if (table.headers.length === 0 || table.rows.length === 0) return null;
    return table;
  }, [rawText]);

  const effectiveMapping: StatementColumnMapping | null = useMemo(() => {
    if (!parsedTable) return null;
    if (mappingOverride) return mappingOverride;
    return detectStatementColumns(parsedTable.headers);
  }, [parsedTable, mappingOverride]);

  const targetCard = useMemo(
    () => cards.find((c) => c.id === selectedCardId),
    [cards, selectedCardId]
  );

  const defaultCardCurrency: CardCurrency = targetCard
    ? normalizeCardCurrency(targetCard.currency)
    : 'AMD';

  const basePreviewRows: StatementPreviewRow[] = useMemo(() => {
    if (!parsedTable || !effectiveMapping) return [];
    return buildStatementPreviewRows({
      table: parsedTable,
      mapping: effectiveMapping,
      defaultCurrency: defaultCardCurrency,
      existingTransactions: transactions,
      customCategories,
      fxRates,
    });
  }, [
    parsedTable,
    effectiveMapping,
    defaultCardCurrency,
    transactions,
    customCategories,
    fxRates,
  ]);

  const previewRows = useMemo(
    () =>
      basePreviewRows.map((row) => ({
        ...row,
        selected:
          selectedOverrides[row.id] !== undefined
            ? selectedOverrides[row.id]
            : row.selected,
        category: categoryOverrides[row.id] ?? row.category,
      })),
    [basePreviewRows, selectedOverrides, categoryOverrides]
  );

  const expenseCategories = useMemo(
    () => mergeExpenseCategories(customCategories),
    [customCategories]
  );
  const incomeCategories = useMemo(
    () => mergeIncomeCategories(customCategories),
    [customCategories]
  );

  const selectedRows = useMemo(
    () => previewRows.filter((r) => r.selected),
    [previewRows]
  );

  const duplicateCount = useMemo(
    () => previewRows.filter((r) => r.isDuplicate).length,
    [previewRows]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setFileName(file.name);
    setMappingOverride(null);
    setSelectedOverrides({});
    setCategoryOverrides({});
    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === 'string' ? reader.result : '';
      if (!content.trim()) {
        setError('Ընտրված ֆայլը դատարկ է կամ անընթեռնելի։');
        return;
      }
      setRawText(content);
    };
    reader.onerror = () => {
      setError('Չհաջողվեց կարդալ CSV ֆայլը։');
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleSelectOnlyNew = () => {
    const next: Record<string, boolean> = {};
    for (const r of previewRows) {
      next[r.id] = !r.isDuplicate;
    }
    setSelectedOverrides(next);
  };

  const handleSelectAll = () => {
    const allSelected =
      previewRows.length > 0 && selectedRows.length === previewRows.length;
    const next: Record<string, boolean> = {};
    for (const r of previewRows) {
      next[r.id] = !allSelected;
    }
    setSelectedOverrides(next);
  };

  const updateMappingCol = (
    key: keyof StatementColumnMapping,
    value: string
  ) => {
    if (!effectiveMapping) return;
    const parsed = value === '' ? null : Number(value);
    setMappingOverride({
      ...effectiveMapping,
      [key]: parsed,
    } as StatementColumnMapping);
  };

  const handleConfirmImport = () => {
    if (selectedRows.length === 0) {
      setError('Ընտրեք գոնե մեկ գործարք ներմուծման համար։');
      return;
    }

    const items: Array<Omit<Transaction, 'id' | 'createdAt'>> = selectedRows.map(
      (row) => {
        const payload: Omit<Transaction, 'id' | 'createdAt'> = {
          type: row.type,
          amount: row.amountAMD,
          title: row.title,
          category: row.category,
          date: row.date,
          isPending: false,
          ...(selectedCardId ? { cardId: selectedCardId } : {}),
        };

        if (defaultCardCurrency !== 'AMD') {
          const cardAmt =
            row.currency === defaultCardCurrency
              ? row.nativeAmount
              : convertFromAMD(row.amountAMD, defaultCardCurrency, fxRates);
          if (cardAmt > 0) {
            payload.cardAmount = cardAmt;
            payload.cardCurrency = defaultCardCurrency;
          }
        } else if (row.currency !== 'AMD') {
          payload.cardAmount = row.nativeAmount;
          payload.cardCurrency = row.currency;
        }

        return payload;
      }
    );

    onImportTransactions(items);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#020617]/65 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="statement-import-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        initial={
          prefersReducedMotion ? false : { opacity: 0, y: 16, scale: 0.98 }
        }
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{
          duration: prefersReducedMotion ? 0.04 : 0.18,
          ease: [0.22, 1, 0.36, 1],
        }}
        className="w-full sm:max-w-3xl max-h-[92dvh] flex flex-col rounded-t-3xl sm:rounded-2xl border-t sm:border border-[#E2E8F0] dark:border-[#1E293B] bg-white dark:bg-[#0F172A] shadow-2xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-[#E2E8F0] dark:border-[#1E293B] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 rounded-xl bg-[#EFF6FF] dark:bg-[#172554] text-[#2563EB] dark:text-[#60A5FA] flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h2
                id="statement-import-title"
                className="font-display text-base sm:text-lg font-semibold text-[#0F172A] dark:text-[#F8FAFC] truncate"
              >
                Բանկային քաղվածքի ներմուծում (CSV)
              </h2>
              <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                Ավտոմատ սյունակների ճանաչում, կատեգորիզացում և կրկնօրինակների ստուգում
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Փակել պատուհանը"
            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-[#64748B] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scroll-container p-5 space-y-4">
          {/* Input Mode & Card Selection */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
            <div className="sm:col-span-6 space-y-1.5">
              <span className="block text-xs font-medium text-[#64748B] dark:text-[#94A3B8]">
                Մուտքագրման եղանակ
              </span>
              <div className="inline-flex items-center p-1 rounded-xl surface-subtle w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setInputMode('file')}
                  className={`flex-1 sm:flex-none min-h-[34px] px-3 py-1 rounded-lg text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    inputMode === 'file'
                      ? 'bg-white dark:bg-[#0F172A] text-[#2563EB] dark:text-[#60A5FA] font-semibold shadow-xs'
                      : 'text-[#64748B] dark:text-[#94A3B8]'
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Ֆայլ (.csv / .tsv)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode('paste')}
                  className={`flex-1 sm:flex-none min-h-[34px] px-3 py-1 rounded-lg text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    inputMode === 'paste'
                      ? 'bg-white dark:bg-[#0F172A] text-[#2563EB] dark:text-[#60A5FA] font-semibold shadow-xs'
                      : 'text-[#64748B] dark:text-[#94A3B8]'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Տեղադրել տեքստ</span>
                </button>
              </div>
            </div>

            {cards.length > 0 && (
              <div className="sm:col-span-6">
                <label className="block text-xs font-medium text-[#64748B] dark:text-[#94A3B8] mb-1">
                  Նպատակային քարտ կամ դրամապանակ
                </label>
                <select
                  value={selectedCardId}
                  onChange={(e) => setSelectedCardId(e.target.value)}
                  className="w-full min-h-[40px] px-3 py-1.5 text-xs sm:text-sm rounded-xl input-field"
                >
                  {cards.map((c) => (
                    <option key={c.id} value={c.id}>
                      {formatCardLabel(c)}
                    </option>
                  ))}
                  <option value="">Առանց քարտի</option>
                </select>
              </div>
            )}
          </div>

          {inputMode === 'file' ? (
            <div className="rounded-xl border border-dashed border-[#CBD5E1] dark:border-[#334155] bg-[#F8FAFC] dark:bg-[#0B1120] p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.tsv,.txt,text/csv,text/plain"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="min-w-0 text-center sm:text-left">
                <p className="text-sm font-medium text-[#0F172A] dark:text-[#F8FAFC] truncate">
                  {fileName || 'Ընտրեք բանկային CSV քաղվածք'}
                </p>
                <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-0.5">
                  Աջակցվում են Ameriabank, IDBank, Ardshinbank, Inecobank և ստորակետ/կետ-ստորակետ CSV-ներ
                </p>
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="min-h-[38px] px-4 py-1.5 rounded-xl btn-primary text-xs inline-flex items-center gap-1.5 shrink-0"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{fileName ? 'Փոխել ֆայլը' : 'Ընտրել ֆայլ'}</span>
              </button>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-[#64748B] dark:text-[#94A3B8] mb-1">
                Տեղադրեք CSV կամ աղյուսակային տեքստ (առաջին տողը՝ վերնագրեր)
              </label>
              <textarea
                rows={4}
                value={rawText}
                onChange={(e) => {
                  setRawText(e.target.value);
                  setMappingOverride(null);
                  setSelectedOverrides({});
                  setCategoryOverrides({});
                  setError('');
                }}
                placeholder="Date,Description,Amount&#10;2026-11-20,SAS Supermarket,-14500&#10;2026-11-21,Salary,450000"
                className="w-full px-3 py-2 text-xs font-mono rounded-xl input-field resize-y"
              />
            </div>
          )}

          {/* Column Mapping */}
          {parsedTable && effectiveMapping && (
            <div className="rounded-xl border border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC]/80 dark:bg-[#0B1120] p-3 space-y-2.5">
              <p className="text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                Սյունակների համապատասխանեցում ({parsedTable.rows.length} տող)
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div>
                  <label className="block text-[11px] text-[#64748B] dark:text-[#94A3B8] mb-0.5">
                    Ամսաթիվ
                  </label>
                  <select
                    value={effectiveMapping.dateCol}
                    onChange={(e) => updateMappingCol('dateCol', e.target.value)}
                    className="w-full min-h-[34px] px-2 rounded-lg input-field text-xs"
                  >
                    {parsedTable.headers.map((h, i) => (
                      <option key={`date-${i}`} value={i}>
                        {h || `Սյունակ ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-[#64748B] dark:text-[#94A3B8] mb-0.5">
                    Նկարագրություն
                  </label>
                  <select
                    value={effectiveMapping.titleCol}
                    onChange={(e) => updateMappingCol('titleCol', e.target.value)}
                    className="w-full min-h-[34px] px-2 rounded-lg input-field text-xs"
                  >
                    {parsedTable.headers.map((h, i) => (
                      <option key={`title-${i}`} value={i}>
                        {h || `Սյունակ ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-[#64748B] dark:text-[#94A3B8] mb-0.5">
                    Գումար (+/-)
                  </label>
                  <select
                    value={effectiveMapping.amountCol ?? ''}
                    onChange={(e) => updateMappingCol('amountCol', e.target.value)}
                    className="w-full min-h-[34px] px-2 rounded-lg input-field text-xs"
                  >
                    <option value="">Չօգտագործել</option>
                    {parsedTable.headers.map((h, i) => (
                      <option key={`amt-${i}`} value={i}>
                        {h || `Սյունակ ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-[#64748B] dark:text-[#94A3B8] mb-0.5">
                    Ելք / Դեբետ
                  </label>
                  <select
                    value={effectiveMapping.debitCol ?? ''}
                    onChange={(e) => updateMappingCol('debitCol', e.target.value)}
                    className="w-full min-h-[34px] px-2 rounded-lg input-field text-xs"
                  >
                    <option value="">Չկա</option>
                    {parsedTable.headers.map((h, i) => (
                      <option key={`deb-${i}`} value={i}>
                        {h || `Սյունակ ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-[#64748B] dark:text-[#94A3B8] mb-0.5">
                    Մուտք / Կրեդիտ
                  </label>
                  <select
                    value={effectiveMapping.creditCol ?? ''}
                    onChange={(e) => updateMappingCol('creditCol', e.target.value)}
                    className="w-full min-h-[34px] px-2 rounded-lg input-field text-xs"
                  >
                    <option value="">Չկա</option>
                    {parsedTable.headers.map((h, i) => (
                      <option key={`cred-${i}`} value={i}>
                        {h || `Սյունակ ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-[#64748B] dark:text-[#94A3B8] mb-0.5">
                    Արժույթ
                  </label>
                  <select
                    value={effectiveMapping.currencyCol ?? ''}
                    onChange={(e) =>
                      updateMappingCol('currencyCol', e.target.value)
                    }
                    className="w-full min-h-[34px] px-2 rounded-lg input-field text-xs"
                  >
                    <option value="">Քարտի արժույթով</option>
                    {parsedTable.headers.map((h, i) => (
                      <option key={`ccy-${i}`} value={i}>
                        {h || `Սյունակ ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-[#64748B] dark:text-[#94A3B8] mb-0.5">
                    Կատեգորիա
                  </label>
                  <select
                    value={effectiveMapping.categoryCol ?? ''}
                    onChange={(e) =>
                      updateMappingCol('categoryCol', e.target.value)
                    }
                    className="w-full min-h-[34px] px-2 rounded-lg input-field text-xs"
                  >
                    <option value="">Ավտոմատ</option>
                    {parsedTable.headers.map((h, i) => (
                      <option key={`cat-${i}`} value={i}>
                        {h || `Սյունակ ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Preview List */}
          {parsedTable && previewRows.length === 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Ճանաչվող գործարքներ չգտնվեցին։ Ստուգեք վերևի սյունակների համապատասխանեցումը (ամսաթիվ և գումար)։
            </p>
          )}

          {previewRows.length > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="text-[#475569] dark:text-[#CBD5E1] tabular-nums">
                  <span>Գտնվել է {previewRows.length} գործարք</span>
                  {duplicateCount > 0 && (
                    <span className="text-amber-600 dark:text-amber-400">
                      {' '}
                      · {duplicateCount} հավանական կրկնօրինակ
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {duplicateCount > 0 && (
                    <button
                      type="button"
                      onClick={handleSelectOnlyNew}
                      className="text-xs font-medium text-[#2563EB] dark:text-[#60A5FA] hover:underline cursor-pointer"
                    >
                      Ընտրել միայն նորերը
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="text-xs font-medium text-[#475569] dark:text-[#CBD5E1] hover:underline cursor-pointer"
                  >
                    {selectedRows.length === previewRows.length
                      ? 'Հանել բոլորը'
                      : 'Ընտրել բոլորը'}
                  </button>
                </div>
              </div>

              <div className="border border-[#E2E8F0] dark:border-[#1E293B] rounded-xl divide-y divide-[#F1F5F9] dark:divide-[#1E293B] max-h-[300px] overflow-y-auto scroll-container">
                {previewRows.map((row) => {
                  const catOptions =
                    row.type === 'income' ? incomeCategories : expenseCategories;
                  return (
                    <div
                      key={row.id}
                      className={`px-3 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs ${
                        row.selected
                          ? 'bg-white dark:bg-[#0F172A]'
                          : 'bg-[#F8FAFC]/70 dark:bg-[#0B1120]/60 opacity-65'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedOverrides((prev) => ({
                              ...prev,
                              [row.id]: !row.selected,
                            }))
                          }
                          aria-label={`Ընտրել ${row.title}`}
                          aria-pressed={row.selected}
                          className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 cursor-pointer transition-colors ${
                            row.selected
                              ? 'bg-[#2563EB] border-[#2563EB] dark:bg-[#3B82F6] dark:border-[#3B82F6] text-white dark:text-[#060B16]'
                              : 'border-[#CBD5E1] dark:border-[#334155] bg-white dark:bg-[#0B1120]'
                          }`}
                        >
                          {row.selected && (
                            <Check className="w-3 h-3" strokeWidth={2.8} />
                          )}
                        </button>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-medium text-[#0F172A] dark:text-[#F8FAFC] truncate">
                              {row.title}
                            </span>
                            {row.isDuplicate && (
                              <span className="shrink-0 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                                · Կրկնօրինակ
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] font-mono text-[#64748B] dark:text-[#94A3B8] tabular-nums">
                            {row.date}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-2 pl-6 sm:pl-0 shrink-0">
                        <select
                          value={row.category}
                          onChange={(e) =>
                            setCategoryOverrides((prev) => ({
                              ...prev,
                              [row.id]: e.target.value,
                            }))
                          }
                          aria-label={`Կատեգորիա՝ ${row.title}`}
                          className="min-h-[30px] px-2 py-1 text-[11px] rounded-lg input-field max-w-[140px]"
                        >
                          {catOptions.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>

                        <div className="text-right font-mono tabular-nums min-w-[88px]">
                          <span
                            className={`pa-sensitive font-semibold ${
                              row.type === 'income'
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-[#0F172A] dark:text-[#F8FAFC]'
                            }`}
                          >
                            {row.type === 'income' ? '+' : '-'}
                            {formatMoney(row.amountAMD, 'AMD')}
                          </span>
                          {row.currency !== 'AMD' && (
                            <span className="block text-[10px] text-[#64748B] dark:text-[#94A3B8]">
                              {formatCardMoney(row.nativeAmount, row.currency)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {error && (
            <p className="text-xs text-rose-600 dark:text-rose-400" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="px-5 py-3.5 pb-[calc(0.875rem+env(safe-area-inset-bottom))] border-t border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#0B1120] flex flex-wrap items-center justify-between gap-2 shrink-0">
          <span className="text-xs text-[#64748B] dark:text-[#94A3B8] tabular-nums">
            {selectedRows.length > 0
              ? `Ընտրված՝ ${selectedRows.length} գործարք`
              : 'Ներմուծման պատրաստ տվյալներ'}
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[38px] px-4 py-1.5 rounded-xl border border-[#CBD5E1] dark:border-[#26334D] text-xs sm:text-sm font-medium text-[#475569] dark:text-[#CBD5E1] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] transition-colors cursor-pointer"
            >
              Չեղարկել
            </button>
            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={selectedRows.length === 0}
              className="min-h-[38px] px-4 py-1.5 rounded-xl btn-primary text-xs sm:text-sm disabled:opacity-45"
            >
              Ներմուծել ({selectedRows.length})
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
