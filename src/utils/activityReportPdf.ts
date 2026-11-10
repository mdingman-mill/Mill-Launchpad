import { jsPDF } from 'jspdf';
import { User, Plan, AuditLogEntry } from '../types';

interface GenerateActivityPdfOptions {
  user: User;
  plan?: Plan;
  activities: AuditLogEntry[];
  filterLabel?: string;
  searchQuery?: string;
  usageInfo?: {
    current: number;
    max: number;
    percentage: number;
  };
}

function classifyPdfActivity(log: AuditLogEntry): {
  categoryLabel: string;
  title: string;
} {
  const action = (log.action || '').toUpperCase();
  const details = log.details || '';

  if (action === 'TOOL_GENERATION') {
    const toolMatch = details.match(/Generated output with (.+)/i);
    const toolName = toolMatch ? toolMatch[1] : 'Marketing Tool';
    return {
      categoryLabel: 'AI Generation',
      title: `Generated with ${toolName}`,
    };
  }

  if (action === 'OUTPUT_SAVED') {
    return {
      categoryLabel: 'Saved to Library',
      title: 'Marketing Deliverable Saved',
    };
  }

  if (action === 'PLAN_UPGRADED' || action === 'ADMIN_PLAN_CHANGE') {
    return {
      categoryLabel: 'Plan Upgrade',
      title: 'Subscription Tier Upgraded',
    };
  }

  if (action === 'SUBSCRIPTION_CANCELED') {
    return {
      categoryLabel: 'Plan Cancellation',
      title: 'Subscription Canceled',
    };
  }

  if (action === 'SUBSCRIPTION_CHANGED') {
    return {
      categoryLabel: 'Plan Modification',
      title: 'Subscription Tier Modified',
    };
  }

  if (action === 'BONUS_GENERATIONS_GRANTED') {
    return {
      categoryLabel: 'Bonus Credits',
      title: 'Bonus Generations Awarded',
    };
  }

  if (action === 'DISCOUNT_APPROVED' || action === 'DISCOUNT_TOGGLED') {
    return {
      categoryLabel: 'Nonprofit Rate',
      title: '25% Nonprofit Discount Approved',
    };
  }

  if (action === 'USAGE_RESET') {
    return {
      categoryLabel: 'Billing Cycle',
      title: 'Monthly Generation Quota Reset',
    };
  }

  if (action.startsWith('TEAM_MEMBER_') || action === 'PROFILE_CONFIGURED') {
    return {
      categoryLabel: 'Workspace',
      title: action === 'PROFILE_CONFIGURED' ? 'Organization Profile Configured' : 'Team Seat Updated',
    };
  }

  return {
    categoryLabel: 'Account Activity',
    title: action.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()),
  };
}

export function generateActivityReportPdf({
  user,
  plan,
  activities,
  filterLabel = 'All Activity',
  searchQuery = '',
  usageInfo,
}: GenerateActivityPdfOptions): string {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4',
  });

  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 40;
  const contentWidth = pageWidth - 2 * margin;

  // Counts
  let genCount = 0;
  let planCount = 0;
  let savedCount = 0;
  activities.forEach((item) => {
    const act = (item.action || '').toUpperCase();
    if (act === 'TOOL_GENERATION') genCount++;
    else if (act.includes('PLAN') || act.includes('SUBSCRIPTION') || act.includes('BONUS') || act.includes('DISCOUNT') || act.includes('USAGE_RESET')) planCount++;
    else if (act === 'OUTPUT_SAVED') savedCount++;
  });

  const now = new Date();
  const dateFormatted = now.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const timeFormatted = now.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  // Helper to render table header
  const drawTableHeader = (y: number) => {
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(margin, y, contentWidth, 22, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);

    doc.text('DATE & TIME', margin + 8, y + 14);
    doc.text('CATEGORY', margin + 95, y + 14);
    doc.text('EVENT & DETAILS', margin + 185, y + 14);
    doc.text('ACTOR', margin + 440, y + 14);

    return y + 22;
  };

  // --- PAGE 1 HEADER ---
  // Top decorative bar
  doc.setFillColor(225, 29, 72); // rose-600
  doc.rect(margin, 35, contentWidth, 3, 'F');

  // Brand kicker
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(225, 29, 72);
  doc.text('MILLENNIUM AGENCY  ·  LAUNCHPAD', margin, 52);

  // Document Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.text('Activity History & Generation Audit', margin, 74);

  // Subtitle
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    'Official audit log of AI marketing generations, subscription modifications, and workspace actions.',
    margin,
    88
  );

  // Generated metadata on right
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(`Generated: ${dateFormatted} at ${timeFormatted}`, pageWidth - margin, 52, {
    align: 'right',
  });
  doc.text(`Scope: ${filterLabel}${searchQuery ? ` ("${searchQuery}")` : ''}`, pageWidth - margin, 64, {
    align: 'right',
  });

  // Hairline separator
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, 98, pageWidth - margin, 98);

  // --- CLIENT & ORGANIZATION CARD (Y = 106) ---
  const orgCardY = 106;
  const orgCardHeight = 52;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, orgCardY, contentWidth, orgCardHeight, 4, 4, 'FD');

  const orgName = user.organizationProfile?.orgName || user.name;
  const orgType = user.organizationProfile?.type || 'Startup';
  const planName = plan?.name || 'Free Starter';
  const currentUsageStr = usageInfo
    ? `${usageInfo.current} of ${usageInfo.max} generations (${usageInfo.percentage}%)`
    : `${user.generationsUsedThisMonth || 0} generations used`;

  // Left Column
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text('ORGANIZATION', margin + 12, orgCardY + 16);
  doc.text('TIER & SEATS', margin + 12, orgCardY + 36);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text(orgName, margin + 85, orgCardY + 16);

  doc.setFont('helvetica', 'normal');
  doc.text(`${planName} (${orgType})`, margin + 85, orgCardY + 36);

  // Right Column
  const rightColX = margin + 280;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text('PRIMARY CONTACT', rightColX, orgCardY + 16);
  doc.text('CURRENT USAGE', rightColX, orgCardY + 36);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text(`${user.name} <${user.email}>`, rightColX + 85, orgCardY + 16);
  doc.text(currentUsageStr, rightColX + 85, orgCardY + 36);

  // --- SUMMARY KPI METRICS STRIP (Y = 166) ---
  const kpiY = 166;
  const kpiHeight = 36;
  const kpiBoxWidth = (contentWidth - 18) / 4;

  const kpis = [
    { label: 'AI GENERATIONS', val: String(genCount), sub: 'Marketing tools' },
    { label: 'PLAN CHANGES', val: String(planCount), sub: 'Upgrades & bonus' },
    { label: 'SAVED DELIVERABLES', val: String(savedCount), sub: 'Library assets' },
    { label: 'TOTAL LOGGED', val: String(activities.length), sub: 'Audited records' },
  ];

  kpis.forEach((kpi, idx) => {
    const boxX = margin + idx * (kpiBoxWidth + 6);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(boxX, kpiY, kpiBoxWidth, kpiHeight, 4, 4, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(148, 163, 184);
    doc.text(kpi.label, boxX + 8, kpiY + 12);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(kpi.val, boxX + 8, kpiY + 28);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(kpi.sub, boxX + 32, kpiY + 28);
  });

  // --- ACTIVITY TABLE (Starts at Y = 210) ---
  let currentY = drawTableHeader(210);

  if (activities.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text('No activity records found matching the current criteria.', margin + 12, currentY + 24);
    currentY += 40;
  } else {
    activities.forEach((item, index) => {
      const cls = classifyPdfActivity(item);

      // Parse timestamp
      let dateStr = item.timestamp;
      let timeStr = '';
      try {
        const d = new Date(item.timestamp);
        dateStr = d.toISOString().split('T')[0];
        timeStr = d.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });
      } catch {
        dateStr = item.timestamp.split('T')[0] || item.timestamp;
      }

      // Wrap details text (width: 245pt)
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      const wrappedDetails = doc.splitTextToSize(item.details || '', 245);
      const textHeight = Math.max(wrappedDetails.length * 9.5, 12);
      const rowHeight = Math.max(textHeight + 16, 28);

      // Check for page overflow (keep 45pt bottom margin)
      if (currentY + rowHeight > pageHeight - 45) {
        doc.addPage();
        currentY = drawTableHeader(40);
      }

      // Alternate row background
      if (index % 2 === 0) {
        doc.setFillColor(255, 255, 255);
      } else {
        doc.setFillColor(248, 250, 252);
      }
      doc.rect(margin, currentY, contentWidth, rowHeight, 'F');

      // Hairline row bottom border
      doc.setDrawColor(241, 245, 249);
      doc.line(margin, currentY + rowHeight, margin + contentWidth, currentY + rowHeight);

      // Column 1: Date & Time
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(51, 65, 85);
      doc.text(dateStr, margin + 8, currentY + 12);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      if (timeStr) {
        doc.text(timeStr, margin + 8, currentY + 22);
      }

      // Column 2: Category
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      if (cls.categoryLabel === 'AI Generation') {
        doc.setTextColor(225, 29, 72); // rose-600
      } else if (cls.categoryLabel.includes('Plan') || cls.categoryLabel.includes('Rate')) {
        doc.setTextColor(79, 70, 229); // indigo-600
      } else if (cls.categoryLabel.includes('Saved')) {
        doc.setTextColor(217, 119, 6); // amber-600
      } else {
        doc.setTextColor(71, 85, 105); // slate-600
      }
      doc.text(cls.categoryLabel, margin + 95, currentY + 13);

      // Column 3: Event Title + Wrapped Details
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text(cls.title, margin + 185, currentY + 12);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      wrappedDetails.forEach((line: string, lineIdx: number) => {
        doc.text(line, margin + 185, currentY + 21 + lineIdx * 9);
      });

      // Column 4: Actor
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);
      const actorName = item.actorName || (item.actorId === 'system' ? 'System' : user.name);
      doc.text(actorName, margin + 440, currentY + 13);

      currentY += rowHeight;
    });
  }

  // --- FOOTERS (On all pages) ---
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);

    doc.setDrawColor(226, 232, 240);
    doc.line(margin, pageHeight - 32, pageWidth - margin, pageHeight - 32);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(
      'Millennium Agency Launchpad  ·  Confidential Client Activity & Audit Report',
      margin,
      pageHeight - 20
    );
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 20, {
      align: 'right',
    });
  }

  // Clean filename
  const cleanOrg = orgName.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const dateStamp = now.toISOString().split('T')[0];
  const filename = `millennium_activity_report_${cleanOrg}_${dateStamp}.pdf`;

  // Trigger browser download
  doc.save(filename);

  return filename;
}
