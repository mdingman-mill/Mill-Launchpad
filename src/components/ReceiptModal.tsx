import React from 'react';
import { Invoice } from '../types';
import { X, Printer, Download, CheckCircle2, Building, ShieldCheck } from 'lucide-react';

interface ReceiptModalProps {
  invoice: Invoice | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({ invoice, isOpen, onClose }) => {
  if (!isOpen || !invoice) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadText = () => {
    const textContent = `
=====================================================
MILLENNIUM AGENCY LAUNCHPAD - INVOICE RECEIPT
=====================================================
Receipt ID:     ${invoice.pdfReceiptId}
Invoice ID:     ${invoice.id}
Date:           ${invoice.date}
Status:         ${invoice.status.toUpperCase()}

BILLED TO:
Customer:       ${invoice.userName}
Email:          ${invoice.userEmail}
Organization:   ${invoice.orgName}
Address:        ${invoice.billingAddress || 'N/A'}

ITEMS:
- ${invoice.planName} (Monthly Subscription): $${invoice.amount.toFixed(2)}

TOTAL PAID:     $${invoice.amount.toFixed(2)} USD
Payment Method: Visa ending in 4242 (Simulated Stripe)

MILLENNIUM AGENCY
Website: https://mill.agency
Schedule Consultation: https://calendly.com/lindafanaras/linkedin-intro
=====================================================
Thank you for partnering with Millennium Agency!
    `.trim();

    const blob = new Blob([textContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Millennium_Receipt_${invoice.pdfReceiptId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200">
        {/* Top toolbar */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span className="text-xs font-bold text-slate-700">Official Payment Receipt</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadText}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200 transition-colors"
              title="Download text receipt"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={handlePrint}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200 transition-colors"
              title="Print receipt / Save as PDF"
            >
              <Printer className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Receipt Paper */}
        <div className="p-8 space-y-6" id="receipt-paper">
          {/* Agency Header */}
          <div className="flex items-start justify-between pb-6 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-7 h-7 rounded-lg bg-rose-600 flex items-center justify-center font-extrabold text-white text-sm">
                  M
                </div>
                <span className="font-extrabold text-slate-900 tracking-tight text-lg">
                  Millennium Agency
                </span>
              </div>
              <p className="text-xs text-slate-500">Growth & Brand Strategy Suite</p>
              <p className="text-xs text-slate-400">mill.agency</p>
            </div>
            <div className="text-right">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5" /> PAID
              </span>
              <p className="text-xs font-mono font-bold text-slate-800 mt-2">{invoice.pdfReceiptId}</p>
              <p className="text-xs text-slate-500">Date: {invoice.date}</p>
            </div>
          </div>

          {/* Billed To */}
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <span className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">
                Billed To
              </span>
              <p className="font-bold text-slate-900 mt-0.5">{invoice.userName}</p>
              <p className="text-slate-600">{invoice.orgName}</p>
              <p className="text-slate-500">{invoice.userEmail}</p>
            </div>
            <div>
              <span className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">
                Billing Address
              </span>
              <p className="text-slate-600 mt-0.5">{invoice.billingAddress || '75 State Street, Boston, MA 02109'}</p>
              <p className="text-slate-500">Payment: Visa ending in 4242</p>
            </div>
          </div>

          {/* Line Items */}
          <div className="border border-slate-100 rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase font-bold">
                <tr>
                  <th className="py-2.5 px-4">Description</th>
                  <th className="py-2.5 px-4 text-center">Period</th>
                  <th className="py-2.5 px-4 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="py-3 px-4 font-semibold text-slate-900">
                    {invoice.planName}
                    <div className="text-[10px] text-slate-400 font-normal">
                      Full access to Millennium Agency Launchpad AI marketing tools
                    </div>
                  </td>
                  <td className="py-3 px-4 text-center text-slate-500">1 Month</td>
                  <td className="py-3 px-4 text-right font-bold text-slate-900">
                    ${invoice.amount.toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="pt-2 border-t border-slate-100 flex justify-between items-center text-sm">
            <span className="font-extrabold text-slate-900">Total Paid</span>
            <span className="font-extrabold text-2xl text-slate-900">
              ${invoice.amount.toFixed(2)} <span className="text-xs text-slate-500 font-normal">USD</span>
            </span>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl text-center text-[11px] text-slate-500 flex items-center justify-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Simulated receipt generated by Millennium Agency Launchpad proof-of-concept.</span>
          </div>
        </div>

        {/* Action Button */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button
            onClick={handlePrint}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print or Save PDF</span>
          </button>
        </div>
      </div>
    </div>
  );
};
