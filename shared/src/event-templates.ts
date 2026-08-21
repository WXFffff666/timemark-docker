/** 事件创建预设模板（会议/体检/航班等） */
export interface EventPresetTemplate {
  id: string;
  name: string;
  type: string;
  icon: string;
  reminderDaysBefore: number[];
  reminderTime: string;
  description: string;
}

export const EVENT_PRESET_TEMPLATES: EventPresetTemplate[] = [
  { id: 'meeting', name: '会议', type: 'meeting', icon: '📅', reminderDaysBefore: [0, 1], reminderTime: '09:00', description: '工作会议提醒' },
  { id: 'birthday', name: '生日（公历）', type: 'birthday', icon: '🎂', reminderDaysBefore: [1, 3, 7], reminderTime: '09:00', description: '公历生日提前提醒' },
  { id: 'birthday_lunar', name: '生日（农历）', type: 'birthday', icon: '🌙', reminderDaysBefore: [1, 3, 7], reminderTime: '09:00', description: '农历生日提醒' },
  { id: 'birthday_both', name: '生日（双历）', type: 'birthday', icon: '🎂', reminderDaysBefore: [1, 3, 7], reminderTime: '09:00', description: '公历+农历双历生日' },
  { id: 'anniversary', name: '纪念日', type: 'anniversary', icon: '💍', reminderDaysBefore: [1, 7], reminderTime: '09:00', description: '纪念日提醒' },
  { id: 'exam', name: '考试', type: 'exam', icon: '📝', reminderDaysBefore: [1, 3, 7], reminderTime: '08:00', description: '考试倒计时' },
  { id: 'doctor', name: '体检/就医', type: 'medical', icon: '🏥', reminderDaysBefore: [0, 1], reminderTime: '08:00', description: '就医预约' },
  { id: 'workout', name: '运动', type: 'other', icon: '💪', reminderDaysBefore: [0], reminderTime: '07:00', description: '健身计划' },
  { id: 'flight', name: '航班', type: 'travel', icon: '✈️', reminderDaysBefore: [0, 1], reminderTime: '06:00', description: '航班出发' },
  { id: 'bill', name: '账单缴费', type: 'other', icon: '💳', reminderDaysBefore: [1, 3], reminderTime: '10:00', description: '信用卡/账单' },
  { id: 'holiday', name: '节假日', type: 'holiday', icon: '🎉', reminderDaysBefore: [1], reminderTime: '09:00', description: '假期安排' },
  { id: 'spring_festival', name: '春节', type: 'holiday', icon: '🧧', reminderDaysBefore: [3, 7, 14], reminderTime: '09:00', description: '农历春节' },
  { id: 'mid_autumn', name: '中秋节', type: 'holiday', icon: '🥮', reminderDaysBefore: [1, 3], reminderTime: '09:00', description: '农历中秋' },
  { id: 'interview', name: '面试', type: 'meeting', icon: '👔', reminderDaysBefore: [0, 1], reminderTime: '08:30', description: '求职面试' },
  { id: 'deadline', name: '截止日期', type: 'deadline', icon: '⏰', reminderDaysBefore: [0, 1, 3, 7], reminderTime: '09:00', description: '项目/作业截止' },
  { id: 'travel', name: '出行', type: 'travel', icon: '🧳', reminderDaysBefore: [1, 3], reminderTime: '08:00', description: '旅行出发' },
];

/** 多档位提前提醒预设（分钟级通过当天多次 cron 近似） */
export const REMINDER_TIER_PRESETS = [
  { id: 'urgent', label: '紧急', days: [0, 1] },
  { id: 'standard', label: '标准', days: [1, 3, 7] },
  { id: 'early', label: '提前', days: [1, 3, 7, 14, 30] },
  { id: 'minimal', label: '仅当天', days: [0] },
];
