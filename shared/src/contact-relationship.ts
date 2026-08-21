/**
 * 联系人关系与智能称呼
 * - 家人：亲爱的妈妈 / 爸爸
 * - 其他：亲爱的{昵称或姓名}先生/女士
 */

export type ContactGender = 'male' | 'female' | 'unknown';

export type RelationshipCategory =
  | 'family'
  | 'spouse'
  | 'child'
  | 'relative'
  | 'friend'
  | 'colleague'
  | 'other';

export interface ContactRelationshipOption {
  value: string;
  label: string;
  salutation: string;
  category: RelationshipCategory;
  blessingKeyword: string;
  useRelationSalutation: boolean;
  defaultGender?: ContactGender;
}

export interface ContactRelationshipGroup {
  label: string;
  options: ContactRelationshipOption[];
}

export interface ContactLikeForSalutation {
  name?: string | null;
  nickname?: string | null;
  relationship?: string | null;
  gender?: ContactGender | string | null;
}

const RELATIONSHIP_GROUPS: ContactRelationshipGroup[] = [
  {
    label: '父母',
    options: [
      { value: 'mother', label: '妈妈', salutation: '妈妈', category: 'family', blessingKeyword: '妈妈', useRelationSalutation: true, defaultGender: 'female' },
      { value: 'father', label: '爸爸', salutation: '爸爸', category: 'family', blessingKeyword: '爸爸', useRelationSalutation: true, defaultGender: 'male' },
      { value: 'mom', label: '母亲', salutation: '母亲', category: 'family', blessingKeyword: '妈妈', useRelationSalutation: true, defaultGender: 'female' },
      { value: 'dad', label: '父亲', salutation: '父亲', category: 'family', blessingKeyword: '爸爸', useRelationSalutation: true, defaultGender: 'male' },
    ],
  },
  {
    label: '配偶',
    options: [
      { value: 'wife', label: '老婆', salutation: '老婆', category: 'spouse', blessingKeyword: '老婆', useRelationSalutation: true, defaultGender: 'female' },
      { value: 'husband', label: '老公', salutation: '老公', category: 'spouse', blessingKeyword: '老公', useRelationSalutation: true, defaultGender: 'male' },
      { value: 'spouse_f', label: '妻子', salutation: '妻子', category: 'spouse', blessingKeyword: '老婆', useRelationSalutation: true, defaultGender: 'female' },
      { value: 'spouse_m', label: '丈夫', salutation: '丈夫', category: 'spouse', blessingKeyword: '老公', useRelationSalutation: true, defaultGender: 'male' },
    ],
  },
  {
    label: '子女',
    options: [
      { value: 'son', label: '儿子', salutation: '儿子', category: 'child', blessingKeyword: '儿子', useRelationSalutation: true, defaultGender: 'male' },
      { value: 'daughter', label: '女儿', salutation: '女儿', category: 'child', blessingKeyword: '女儿', useRelationSalutation: true, defaultGender: 'female' },
      { value: 'child', label: '孩子', salutation: '宝贝', category: 'child', blessingKeyword: '宝贝', useRelationSalutation: true },
    ],
  },
  {
    label: '祖辈',
    options: [
      { value: 'grandpa_p', label: '爷爷', salutation: '爷爷', category: 'family', blessingKeyword: '爷爷', useRelationSalutation: true, defaultGender: 'male' },
      { value: 'grandma_p', label: '奶奶', salutation: '奶奶', category: 'family', blessingKeyword: '奶奶', useRelationSalutation: true, defaultGender: 'female' },
      { value: 'grandpa_m', label: '外公', salutation: '外公', category: 'family', blessingKeyword: '外公', useRelationSalutation: true, defaultGender: 'male' },
      { value: 'grandma_m', label: '外婆', salutation: '外婆', category: 'family', blessingKeyword: '外婆', useRelationSalutation: true, defaultGender: 'female' },
      { value: 'grandpa_ml', label: '姥爷', salutation: '姥爷', category: 'family', blessingKeyword: '姥爷', useRelationSalutation: true, defaultGender: 'male' },
      { value: 'grandma_ml', label: '姥姥', salutation: '姥姥', category: 'family', blessingKeyword: '姥姥', useRelationSalutation: true, defaultGender: 'female' },
    ],
  },
  {
    label: '其他亲属',
    options: [
      { value: 'brother', label: '兄弟', salutation: '兄弟', category: 'relative', blessingKeyword: '兄弟', useRelationSalutation: true, defaultGender: 'male' },
      { value: 'sister', label: '姐妹', salutation: '姐妹', category: 'relative', blessingKeyword: '姐妹', useRelationSalutation: true, defaultGender: 'female' },
      { value: 'uncle', label: '叔叔/舅舅', salutation: '叔叔', category: 'relative', blessingKeyword: '叔叔', useRelationSalutation: true, defaultGender: 'male' },
      { value: 'aunt', label: '阿姨/姑姑', salutation: '阿姨', category: 'relative', blessingKeyword: '阿姨', useRelationSalutation: true, defaultGender: 'female' },
    ],
  },
  {
    label: '社交',
    options: [
      { value: 'friend', label: '朋友', salutation: '朋友', category: 'friend', blessingKeyword: '朋友', useRelationSalutation: false },
      { value: 'colleague', label: '同事', salutation: '同事', category: 'colleague', blessingKeyword: '同事', useRelationSalutation: false },
      { value: 'classmate', label: '同学', salutation: '同学', category: 'friend', blessingKeyword: '同学', useRelationSalutation: false },
      { value: 'client', label: '客户', salutation: '客户', category: 'colleague', blessingKeyword: '客户', useRelationSalutation: false },
    ],
  },
  {
    label: '其他',
    options: [
      { value: 'other', label: '其他（按姓名+性别尊称）', salutation: '', category: 'other', blessingKeyword: '', useRelationSalutation: false },
    ],
  },
];

export const CONTACT_RELATIONSHIP_GROUPS = RELATIONSHIP_GROUPS;

export const ALL_CONTACT_RELATIONSHIP_OPTIONS = RELATIONSHIP_GROUPS.flatMap((g) => g.options);

const BY_VALUE = new Map(ALL_CONTACT_RELATIONSHIP_OPTIONS.map((o) => [o.value, o]));

const NAME_ALIASES: Record<string, string> = {
  妈: 'mother', 妈妈: 'mother', 母亲: 'mom', 娘: 'mother',
  爸: 'father', 爸爸: 'father', 父亲: 'dad', 爹: 'father',
  老婆: 'wife', 媳妇: 'wife', 妻子: 'spouse_f', 太太: 'spouse_f',
  老公: 'husband', 丈夫: 'spouse_m',
  儿子: 'son', 女儿: 'daughter', 宝贝: 'child', 宝宝: 'child',
  爷爷: 'grandpa_p', 奶奶: 'grandma_p', 外公: 'grandpa_m', 外婆: 'grandma_m',
  姥爷: 'grandpa_ml', 姥姥: 'grandma_ml',
  哥哥: 'brother', 弟弟: 'brother', 姐姐: 'sister', 妹妹: 'sister',
  朋友: 'friend', 同事: 'colleague', 同学: 'classmate',
};

export function normalizeContactGender(raw?: string | null): ContactGender {
  if (raw === 'male' || raw === 'female') return raw;
  return 'unknown';
}

export function inferRelationshipFromText(text?: string | null): string | undefined {
  const t = text?.trim();
  if (!t) return undefined;
  if (BY_VALUE.has(t)) return t;
  return NAME_ALIASES[t];
}

export function resolveRelationshipOption(
  relationship?: string | null,
  name?: string | null,
  nickname?: string | null,
): ContactRelationshipOption | undefined {
  if (relationship && BY_VALUE.has(relationship)) {
    return BY_VALUE.get(relationship);
  }
  const inferred =
    inferRelationshipFromText(relationship)
    || inferRelationshipFromText(nickname)
    || inferRelationshipFromText(name);
  return inferred ? BY_VALUE.get(inferred) : undefined;
}

function basePersonalName(contact: ContactLikeForSalutation): string {
  return contact.nickname?.trim() || contact.name?.trim() || '';
}

function genderHonorific(gender: ContactGender, baseName: string): string {
  if (!baseName) return '您好';
  if (gender === 'male') return `${baseName}先生`;
  if (gender === 'female') return `${baseName}女士`;
  return baseName;
}

export function resolveContactGreetingName(contact: ContactLikeForSalutation): string {
  const rel = resolveRelationshipOption(contact.relationship, contact.name, contact.nickname);
  if (rel?.useRelationSalutation && rel.salutation) {
    return rel.salutation;
  }
  const base = basePersonalName(contact);
  if (!base) return rel?.salutation || '朋友';
  const gender = normalizeContactGender(contact.gender);
  const effectiveGender = gender === 'unknown' && rel?.defaultGender ? rel.defaultGender : gender;
  return genderHonorific(effectiveGender, base);
}

export function resolveContactDearSalutation(contact: ContactLikeForSalutation): string {
  return `亲爱的${resolveContactGreetingName(contact)}`;
}

export function resolveContactPersonName(contact: ContactLikeForSalutation): string {
  const rel = resolveRelationshipOption(contact.relationship, contact.name, contact.nickname);
  if (contact.nickname?.trim()) return contact.nickname.trim();
  if (rel?.useRelationSalutation && rel.salutation) return rel.salutation;
  return contact.name?.trim() || rel?.salutation || '联系人';
}

export function formatContactListLabel(contact: ContactLikeForSalutation): string {
  const rel = resolveRelationshipOption(contact.relationship, contact.name, contact.nickname);
  const name = contact.name?.trim() || '未命名';
  if (rel && rel.value !== 'other') {
    return `${name}（${rel.label}）`;
  }
  return name;
}

export function getRelationshipCategory(contact: ContactLikeForSalutation): RelationshipCategory {
  const rel = resolveRelationshipOption(contact.relationship, contact.name, contact.nickname);
  return rel?.category ?? 'other';
}

export function isFamilyLikeContact(contact: ContactLikeForSalutation): boolean {
  const cat = getRelationshipCategory(contact);
  return cat === 'family' || cat === 'spouse' || cat === 'child' || cat === 'relative';
}

export function suggestTemplateForContact(
  contact: ContactLikeForSalutation,
  eventType?: string,
): string | null {
  if (!eventType) return null;
  const familyLike = isFamilyLikeContact(contact);

  if (familyLike) {
    if (eventType === 'birthday') return 'birthday_detailed';
    if (eventType === 'holiday') return 'holiday_family';
    if (eventType === 'anniversary') return 'anniversary';
    if (eventType === 'exam') return 'exam';
  }
  if (getRelationshipCategory(contact) === 'colleague' && eventType === 'meeting') return 'meeting';
  if (getRelationshipCategory(contact) === 'colleague' && eventType === 'deadline') return 'deadline';
  if (eventType === 'birthday') return 'birthday';
  return null;
}

export function resolveContactBlessingKeyword(contact: ContactLikeForSalutation): string {
  const rel = resolveRelationshipOption(contact.relationship, contact.name, contact.nickname);
  if (rel?.blessingKeyword) return rel.blessingKeyword;
  return resolveContactPersonName(contact);
}

export const CONTACT_GENDER_OPTIONS: Array<{ value: ContactGender; label: string }> = [
  { value: 'unknown', label: '未指定' },
  { value: 'male', label: '男' },
  { value: 'female', label: '女' },
];
