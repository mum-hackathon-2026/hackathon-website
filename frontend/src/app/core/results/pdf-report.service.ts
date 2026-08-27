import { Injectable } from '@angular/core';
import { jsPDF } from 'jspdf';
import { CriterionResult, JudgeReview } from './results';

export interface EvaluationReportData {
  teamName: string;
  projectTitle: string;
  trackLabel: string;
  finalScore: number | null;
  outcome: string | null;
  judgeCount: number;
  criteria: readonly CriterionResult[];
  reviews: readonly JudgeReview[];
}

@Injectable({ providedIn: 'root' })
export class PdfReportService {
  /**
   * Generates and downloads a clean, professional vector PDF evaluation report
   * for the team's preliminary round results.
   */
  generateAndDownloadReport(data: EvaluationReportData): void {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 18;
    let y = margin;

    // --- Header Background Accent ---
    doc.setFillColor(7, 11, 20); // Dark obsidian
    doc.rect(0, 0, pageWidth, 38, 'F');

    doc.setFillColor(245, 158, 11); // Averis Amber Stripe
    doc.rect(0, 38, pageWidth, 2.5, 'F');

    // --- Event Title ---
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('MONASH HACKATHON 2026', margin, 16);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(200, 210, 230);
    doc.text('Preliminary Round Official Evaluation Report', margin, 24);

    doc.setFontSize(8);
    doc.setTextColor(160, 175, 200);
    doc.text(`Generated: ${new Date().toLocaleDateString('en-MY', { year: 'numeric', month: 'short', day: 'numeric' })}`, pageWidth - margin, 24, { align: 'right' });

    y = 50;

    // --- Team & Project Overview Card ---
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin, y, pageWidth - 2 * margin, 36, 3, 3, 'FD');

    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(data.teamName, margin + 6, y + 8);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(71, 85, 105);
    doc.text(`Project: ${data.projectTitle || 'N/A'}`, margin + 6, y + 15);
    doc.text(`Judges Evaluated: ${data.judgeCount}`, margin + 6, y + 21);

    // Final Score badge on the right
    doc.setFillColor(245, 158, 11);
    doc.roundedRect(pageWidth - margin - 42, y + 6, 36, 24, 2, 2, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    const scoreText = data.finalScore !== null ? data.finalScore.toFixed(1) : '--';
    doc.text(scoreText, pageWidth - margin - 24, y + 17, { align: 'center' });

    doc.setFontSize(7.5);
    doc.text('FINAL SCORE / 100', pageWidth - margin - 24, y + 24, { align: 'center' });

    // Status Pill
    const isFinalist = data.outcome === 'finalist';
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    if (isFinalist) {
      doc.setFillColor(16, 185, 129); // Emerald
      doc.setTextColor(255, 255, 255);
      doc.roundedRect(margin + 6, y + 26, 52, 6.5, 1.5, 1.5, 'F');
      doc.text('QUALIFIED FOR FINALS', margin + 32, y + 30.5, { align: 'center' });
    } else {
      doc.setFillColor(100, 116, 139);
      doc.setTextColor(255, 255, 255);
      doc.roundedRect(margin + 6, y + 26, 44, 6.5, 1.5, 1.5, 'F');
      doc.text('PARTICIPANT', margin + 28, y + 30.5, { align: 'center' });
    }

    y += 46;

    // --- Criteria Breakdown Table ---
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text('Scoring Rubric Breakdown', margin, y);
    y += 5;

    // Table Header
    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(203, 213, 225);
    doc.rect(margin, y, pageWidth - 2 * margin, 7, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    doc.text('CRITERION', margin + 4, y + 4.8);
    doc.text('WEIGHT', pageWidth - margin - 60, y + 4.8, { align: 'right' });
    doc.text('MAX', pageWidth - margin - 35, y + 4.8, { align: 'right' });
    doc.text('SCORE', pageWidth - margin - 6, y + 4.8, { align: 'right' });

    y += 7;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);

    data.criteria.forEach((crit, index) => {
      const rowFill = index % 2 === 0 ? 255 : 250;
      doc.setFillColor(rowFill, rowFill, rowFill);
      doc.rect(margin, y, pageWidth - 2 * margin, 7.5, 'FD');

      doc.setTextColor(15, 23, 42);
      doc.text(crit.title, margin + 4, y + 5);

      doc.setTextColor(100, 116, 139);
      doc.text(`${crit.weight}%`, pageWidth - margin - 60, y + 5, { align: 'right' });
      doc.text(`${crit.maxScore}`, pageWidth - margin - 35, y + 5, { align: 'right' });

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(245, 158, 11);
      doc.text(crit.score.toFixed(1), pageWidth - margin - 6, y + 5, { align: 'right' });
      doc.setFont('helvetica', 'normal');

      y += 7.5;
    });

    y += 10;

    // --- Detailed Judges' Qualitative Feedback ---
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text("Judges' Qualitative Feedback", margin, y);
    y += 6;

    if (data.reviews.length === 0) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);
      doc.text('No qualitative comments were recorded for this squad.', margin, y);
      y += 8;
    } else {
      data.reviews.forEach((review) => {
        if (y > pageHeight - 35) {
          doc.addPage();
          y = margin;
        }

        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(226, 232, 240);

        const feedbackLines = doc.splitTextToSize(
          review.overallFeedback || 'No written comment provided.',
          pageWidth - 2 * margin - 12
        );
        const cardHeight = Math.max(18, 12 + feedbackLines.length * 4.5);

        doc.roundedRect(margin, y, pageWidth - 2 * margin, cardHeight, 2, 2, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(15, 23, 42);
        doc.text(review.label, margin + 4, y + 6);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(51, 65, 85);
        doc.text(feedbackLines, margin + 4, y + 11);

        y += cardHeight + 4;
      });
    }

    // --- Footer Note ---
    const footerY = pageHeight - 12;
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, footerY - 4, pageWidth - margin, footerY - 4);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text('Monash University Malaysia × Averis Preliminary Evaluation — Confidential', margin, footerY);
    doc.text('Paper Finals Round Scheduled for Qualified Teams', pageWidth - margin, footerY, { align: 'right' });

    // Sanitize filename
    const safeName = data.teamName.replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
    doc.save(`monash_hackathon_report_${safeName}.pdf`);
  }
}
