import { SurveyStatus } from "@prisma/client";

export interface StatusTransitionContext {
  questionCount?: number;
  responseCount?: number;
}

export interface TransitionValidationResult {
  valid: boolean;
  reason?: string;
}

export interface SurveyCollectionEligibilityContext {
  status: SurveyStatus;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  responseQuota?: number | null;
}

export type CollectionIneligibleCode =
  | "NOT_PUBLISHED"
  | "NOT_STARTED"
  | "EXPIRED"
  | "QUOTA_EXCEEDED"
  | "ARCHIVED";

export interface CollectionEligibilityResult {
  eligible: boolean;
  code?: CollectionIneligibleCode;
  message?: string;
}

export interface PrePublishQuestion {
  id?: string;
  code: string;
  title: string;
  questionType: string;
  choices?: Array<{ label: string; value: string }>;
}

export interface PrePublishChecklistResult {
  ready: boolean;
  errors: string[];
}

/**
 * 驗證問卷狀態轉換之合法性 (Survey Lifecycle State Machine)
 * 支援狀態：DRAFT, PUBLISHED, CLOSED, ARCHIVED
 */
export function validateStatusTransition(
  currentStatus: SurveyStatus,
  targetStatus: SurveyStatus,
  context: StatusTransitionContext = {}
): TransitionValidationResult {
  if (currentStatus === targetStatus) {
    return { valid: true };
  }

  // 1. DRAFT 狀態轉換
  if (currentStatus === SurveyStatus.DRAFT) {
    if (targetStatus === SurveyStatus.PUBLISHED) {
      if (context.questionCount !== undefined && context.questionCount <= 0) {
        return {
          valid: false,
          reason: "發布問卷前，問卷必須至少包含 1 個有效題目。",
        };
      }
      return { valid: true };
    }
    if (targetStatus === SurveyStatus.ARCHIVED) {
      return { valid: true };
    }
    if (targetStatus === SurveyStatus.CLOSED) {
      return {
        valid: false,
        reason: "草稿狀態之問卷尚未發布，無法直接轉為已關閉 (CLOSED)。",
      };
    }
  }

  // 2. PUBLISHED 狀態轉換
  if (currentStatus === SurveyStatus.PUBLISHED) {
    if (targetStatus === SurveyStatus.CLOSED) {
      return { valid: true };
    }
    if (targetStatus === SurveyStatus.ARCHIVED) {
      return { valid: true };
    }
    if (targetStatus === SurveyStatus.DRAFT) {
      return {
        valid: false,
        reason:
          "已發布之問卷禁止逆向轉為草稿 (DRAFT)，以防止破壞填答連結與歷史數據。如需修改題目請點選「建立新版本 (Clone Version)」。",
      };
    }
  }

  // 3. CLOSED 狀態轉換
  if (currentStatus === SurveyStatus.CLOSED) {
    if (targetStatus === SurveyStatus.PUBLISHED) {
      return { valid: true }; // 重新開啟作答
    }
    if (targetStatus === SurveyStatus.ARCHIVED) {
      return { valid: true }; // 歸檔
    }
    if (targetStatus === SurveyStatus.DRAFT) {
      return {
        valid: false,
        reason: "已關閉之問卷禁止直接逆向轉為草稿 (DRAFT)。如需修改請建立新版本。",
      };
    }
  }

  // 4. ARCHIVED 狀態轉換
  if (currentStatus === SurveyStatus.ARCHIVED) {
    if (targetStatus === SurveyStatus.CLOSED || targetStatus === SurveyStatus.DRAFT) {
      return { valid: true }; // 還原歸檔
    }
    if (targetStatus === SurveyStatus.PUBLISHED) {
      return {
        valid: false,
        reason: "已歸檔之問卷禁止直接發布，請先還原審視設定後再行發布。",
      };
    }
  }

  return {
    valid: false,
    reason: `不支援自狀態 ${currentStatus} 轉換至 ${targetStatus}。`,
  };
}

/**
 * 檢查問卷公開填答資格與收集守衛 (Collection Eligibility Guard)
 */
export function checkSurveyCollectionEligibility(
  survey: SurveyCollectionEligibilityContext,
  currentResponseCount: number = 0,
  now: Date = new Date()
): CollectionEligibilityResult {
  // 1. 狀態檢查
  if (survey.status === SurveyStatus.ARCHIVED) {
    return {
      eligible: false,
      code: "ARCHIVED",
      message: "此問卷已被歸檔，停止所有填答與存取服務。",
    };
  }

  if (survey.status === SurveyStatus.CLOSED) {
    return {
      eligible: false,
      code: "NOT_PUBLISHED",
      message: "此問卷已結束作答收集，目前處於關閉狀態。",
    };
  }

  if (survey.status !== SurveyStatus.PUBLISHED) {
    return {
      eligible: false,
      code: "NOT_PUBLISHED",
      message: "此問卷目前未開放填答 (尚未發布)。",
    };
  }

  // 2. 開始時間檢查 (startDate)
  if (survey.startDate) {
    const start = new Date(survey.startDate);
    if (!isNaN(start.getTime()) && now.getTime() < start.getTime()) {
      return {
        eligible: false,
        code: "NOT_STARTED",
        message: `問卷尚未開始收集作答 (預計開放時間：${start.toLocaleString("zh-TW", { hour12: false })})。`,
      };
    }
  }

  // 3. 截止時間檢查 (endDate)
  if (survey.endDate) {
    const end = new Date(survey.endDate);
    if (!isNaN(end.getTime()) && now.getTime() > end.getTime()) {
      return {
        eligible: false,
        code: "EXPIRED",
        message: `問卷已截止收集作答 (截止時間：${end.toLocaleString("zh-TW", { hour12: false })})。`,
      };
    }
  }

  // 4. 作答配額上限檢查 (responseQuota)
  if (
    typeof survey.responseQuota === "number" &&
    survey.responseQuota > 0 &&
    currentResponseCount >= survey.responseQuota
  ) {
    return {
      eligible: false,
      code: "QUOTA_EXCEEDED",
      message: `問卷已達目標收集配額上限 (${survey.responseQuota} 份)，停止接收新作答。`,
    };
  }

  return { eligible: true };
}

/**
 * 問卷發布前完整性檢查清單 (Pre-publish Checklist)
 */
export function validateSurveyPrePublishChecklist(survey: {
  title?: string;
  questions: PrePublishQuestion[];
}): PrePublishChecklistResult {
  const errors: string[] = [];

  if (!survey.title || survey.title.trim().length === 0) {
    errors.push("問卷標題不能為空。");
  }

  if (!survey.questions || survey.questions.length === 0) {
    errors.push("問卷必須包含至少 1 個題目才能發布。");
    return { ready: false, errors };
  }

  const seenCodes = new Set<string>();

  survey.questions.forEach((q, idx) => {
    const num = idx + 1;
    if (!q.code || q.code.trim().length === 0) {
      errors.push(`第 ${num} 題缺少題目代碼 (Code)。`);
    } else {
      const normalizedCode = q.code.trim().toUpperCase();
      if (seenCodes.has(normalizedCode)) {
        errors.push(`題目代碼 [${q.code}] 重複，各題代碼必須唯一。`);
      }
      seenCodes.add(normalizedCode);
    }

    if (!q.title || q.title.trim().length === 0) {
      errors.push(`第 ${num} 題 [${q.code || "未命名"}] 缺少題目標題。`);
    }

    if (q.questionType === "single_choice" || q.questionType === "multiple_choice") {
      if (!q.choices || q.choices.length === 0) {
        errors.push(`選擇題 [${q.code}] 必須至少包含 1 個選項。`);
      }
    }
  });

  return {
    ready: errors.length === 0,
    errors,
  };
}
