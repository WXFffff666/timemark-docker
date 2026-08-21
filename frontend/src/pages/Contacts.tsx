import { useState, useEffect } from 'react';
import { ArrowLeft, Plus, Trash2, UserPlus, CheckCircle2, AlertCircle, Users, Upload, Mail, Pencil, Send } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSmartBack } from '@/hooks/useSmartBack';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LabeledFieldsEditor, normalizeEntriesForSave } from '@/components/contacts/LabeledFieldsEditor';
import { api } from '@/lib/api';
import {
  EMAIL_CHANNEL_TYPES,
  contactHasChannelAddress,
  CONTACT_RELATIONSHIP_GROUPS,
  CONTACT_GENDER_OPTIONS,
  resolveRelationshipOption,
  resolveContactGreetingName,
  resolveContactDearSalutation,
  formatContactListLabel,
  type ContactLabeledEntry,
} from '@timemark/shared';
import {
  ensureLabeledEntries,
  formatLabeledList,
  getContactEmailList,
  contactHasAnyEmail,
} from '@/lib/contact-utils';

interface FixedContact {
  id: number;
  name: string;
  nickname?: string;
  email?: string;
  phone?: string;
  telegram_chat_id?: string;
  qq?: string;
  wxpusher_uid?: string;
  emails?: ContactLabeledEntry[];
  phones?: ContactLabeledEntry[];
  telegrams?: ContactLabeledEntry[];
  qqs?: ContactLabeledEntry[];
  wxpusher_uids?: ContactLabeledEntry[];
  relationship?: string | null;
  gender?: string | null;
  validation_status?: string;
  channel_account_ids?: number[];
}

interface NotificationAccount {
  id: number;
  name: string;
  type: string;
  is_active?: boolean;
}

interface ContactGroup {
  id: number;
  name: string;
}

interface GroupMember {
  group_id: number;
  email: string;
}

interface ContactForm {
  name: string;
  nickname: string;
  relationship: string;
  gender: string;
  emails: ContactLabeledEntry[];
  phones: ContactLabeledEntry[];
  telegrams: ContactLabeledEntry[];
  qqs: ContactLabeledEntry[];
  wxpusherUids: ContactLabeledEntry[];
  channelAccountIds: number[];
}

const emptyForm = (): ContactForm => ({
  name: '',
  nickname: '',
  relationship: '',
  gender: 'unknown',
  emails: [{ label: '', value: '' }],
  phones: [{ label: '', value: '' }],
  telegrams: [{ label: '', value: '' }],
  qqs: [{ label: '', value: '' }],
  wxpusherUids: [{ label: '', value: '' }],
  channelAccountIds: [],
});

const CHANNEL_TYPE_LABELS: Record<string, string> = {
  resend: 'Resend 邮件',
  email: '邮件',
  smtp: 'SMTP 邮件',
  telegram: 'Telegram',
  wxpusher: 'WxPusher',
  qq: 'QQ',
  twilio: '短信',
};

export default function Contacts() {
  const navigate = useNavigate();
  const goBack = useSmartBack('/dashboard');
  const [tab, setTab] = useState<'contacts' | 'groups'>('contacts');
  const [contacts, setContacts] = useState<FixedContact[]>([]);
  const [accounts, setAccounts] = useState<NotificationAccount[]>([]);
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [sendPickOpen, setSendPickOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [sendingContact, setSendingContact] = useState<FixedContact | null>(null);
  const [form, setForm] = useState<ContactForm>(emptyForm());
  const [groupName, setGroupName] = useState('');
  const [groupEmails, setGroupEmails] = useState('');
  const [sendSubject, setSendSubject] = useState('');
  const [sendHtml, setSendHtml] = useState('<p>您好，</p><p>这是一条来自 TimeMark 的消息。</p>');
  const [sendAccountId, setSendAccountId] = useState<number | ''>('');
  const [sendAvailableEmails, setSendAvailableEmails] = useState<string[]>([]);
  const [sendSelectedEmails, setSendSelectedEmails] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);

  const loadContacts = async () => {
    const data = await api.get<FixedContact[]>('/contacts');
    setContacts(data || []);
  };

  const loadAccounts = async () => {
    const data = await api.get<NotificationAccount[]>('/config/accounts');
    setAccounts((data || []).filter((a) => a.is_active !== false));
  };

  const loadGroups = async () => {
    const data = await api.get<{ groups: ContactGroup[]; members: GroupMember[] }>('/contacts/groups');
    setGroups(data?.groups || []);
    setMembers(data?.members || []);
  };

  const load = async () => {
    setLoading(true);
    try {
      await Promise.all([loadContacts(), loadGroups(), loadAccounts()]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    return () => {
      setOpen(false);
      setGroupOpen(false);
      setSendOpen(false);
      setSendPickOpen(false);
    };
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setError('');
    setOpen(true);
  };

  const openEdit = (c: FixedContact) => {
    setEditingId(c.id);
    setForm({
      name: c.name,
      nickname: c.nickname || '',
      relationship: c.relationship || '',
      gender: c.gender || 'unknown',
      emails: ensureLabeledEntries(c.emails, c.email),
      phones: ensureLabeledEntries(c.phones, c.phone),
      telegrams: ensureLabeledEntries(c.telegrams, c.telegram_chat_id),
      qqs: ensureLabeledEntries(c.qqs, c.qq),
      wxpusherUids: ensureLabeledEntries(c.wxpusher_uids, c.wxpusher_uid),
      channelAccountIds: c.channel_account_ids || [],
    });
    setError('');
    setOpen(true);
  };

  const toggleChannelAccount = (accountId: number) => {
    setForm((prev) => {
      const ids = prev.channelAccountIds.includes(accountId)
        ? prev.channelAccountIds.filter((id) => id !== accountId)
        : [...prev.channelAccountIds, accountId];
      return { ...prev, channelAccountIds: ids };
    });
  };

  const contactFields = {
    email: normalizeEntriesForSave(form.emails)[0]?.value,
    emails: normalizeEntriesForSave(form.emails),
    phone: normalizeEntriesForSave(form.phones)[0]?.value,
    phones: normalizeEntriesForSave(form.phones),
    telegramChatId: normalizeEntriesForSave(form.telegrams)[0]?.value,
    telegrams: normalizeEntriesForSave(form.telegrams),
    qq: normalizeEntriesForSave(form.qqs)[0]?.value,
    qqs: normalizeEntriesForSave(form.qqs),
    wxpusherUid: normalizeEntriesForSave(form.wxpusherUids)[0]?.value,
    wxpusherUids: normalizeEntriesForSave(form.wxpusherUids),
  };

  const compatibleAccounts = accounts.filter((a) =>
    contactHasChannelAddress(a.type, contactFields),
  );

  const emailAccounts = accounts.filter((a) => EMAIL_CHANNEL_TYPES.has(a.type));

  const buildPayload = () => ({
    name: form.name.trim(),
    nickname: form.nickname.trim() || undefined,
    relationship: form.relationship || undefined,
    gender: (form.gender as 'male' | 'female' | 'unknown') || 'unknown',
    emails: normalizeEntriesForSave(form.emails),
    phones: normalizeEntriesForSave(form.phones),
    telegrams: normalizeEntriesForSave(form.telegrams),
    qqs: normalizeEntriesForSave(form.qqs),
    wxpusherUids: normalizeEntriesForSave(form.wxpusherUids),
    channelAccountIds: form.channelAccountIds,
  });

  const save = async () => {
    setError('');
    try {
      const payload = buildPayload();
      if (editingId) {
        await api.put(`/contacts/${editingId}`, payload);
      } else {
        await api.post('/contacts', payload);
      }
      setOpen(false);
      setForm(emptyForm());
      setEditingId(null);
      await loadContacts();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    }
  };

  const saveGroup = async () => {
    setError('');
    try {
      const emails = groupEmails.split(/[,;\s]+/).map((e) => e.trim()).filter(Boolean);
      await api.post('/contacts/groups', { name: groupName.trim(), emails });
      setGroupOpen(false);
      setGroupName('');
      setGroupEmails('');
      await loadGroups();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    }
  };

  const remove = async (id: number) => {
    if (!confirm('确定删除该联系人？')) return;
    await api.delete(`/contacts/${id}`);
    await loadContacts();
  };

  const openQuickSend = (c: FixedContact) => {
    const emails = getContactEmailList(c);
    const boundEmail = (c.channel_account_ids || [])
      .map((id) => emailAccounts.find((a) => a.id === id))
      .find(Boolean);
    setSendingContact(c);
    setSendAvailableEmails(emails);
    setSendSubject(`来自 TimeMark 的消息 - ${c.name}`);
    setSendHtml(`<p>${resolveContactDearSalutation(c)}，</p><p>这是一条来自 TimeMark 的消息。</p>`);
    setSendAccountId(boundEmail?.id ?? emailAccounts[0]?.id ?? '');
    setError('');

    if (emails.length === 1) {
      setSendSelectedEmails(emails);
      setSendPickOpen(false);
      setSendOpen(true);
    } else {
      setSendSelectedEmails([]);
      setSendPickOpen(true);
      setSendOpen(false);
    }
  };

  const proceedToCompose = () => {
    if (sendSelectedEmails.length === 0) {
      setError('请至少选择一个收件邮箱');
      return;
    }
    setError('');
    setSendPickOpen(false);
    setSendOpen(true);
  };

  const toggleSendEmail = (email: string) => {
    setSendSelectedEmails((prev) =>
      prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email],
    );
  };

  const quickSend = async () => {
    if (!sendingContact || sendSelectedEmails.length === 0) return;
    setSending(true);
    setError('');
    try {
      const result = await api.post<{
        recipients: string[];
        failed?: string[];
      }>(`/contacts/${sendingContact.id}/send-email`, {
        subject: sendSubject,
        html: sendHtml,
        accountId: sendAccountId || undefined,
        recipientEmails: sendSelectedEmails,
      });
      setSendOpen(false);
      setSendingContact(null);
      const sent = result?.recipients?.join('、') || sendSelectedEmails.join('、');
      alert(`已向 ${sent} 发送邮件`);
    } catch (e) {
      setError(e instanceof Error ? e.message : '发送失败');
    } finally {
      setSending(false);
    }
  };

  const importVcard = async (file: File) => {
    setImporting(true);
    setError('');
    try {
      const text = await file.text();
      const token = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken');
      const res = await fetch('/api/contacts/import-vcard', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'text/vcard',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: text,
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || '导入失败');
      alert(`已从 vCard 导入 ${data.data?.imported ?? 0} 个生日事件`);
      await loadContacts();
    } catch (e) {
      setError(e instanceof Error ? e.message : '导入失败');
    } finally {
      setImporting(false);
    }
  };

  const membersFor = (groupId: number) => members.filter((m) => m.group_id === groupId);

  const getAccountName = (id: number) => {
    const acc = accounts.find((a) => a.id === id);
    if (!acc) return `#${id}`;
    return `${acc.name} (${CHANNEL_TYPE_LABELS[acc.type] || acc.type})`;
  };

  const canQuickSend = (c: FixedContact) => {
    if (!contactHasAnyEmail(c) || emailAccounts.length === 0) return false;
    const bound = c.channel_account_ids || [];
    if (bound.length === 0) return true;
    return bound.some((id) => emailAccounts.some((a) => a.id === id));
  };

  const renderContactMethods = (c: FixedContact) => {
    const rows: { icon: string; text: string }[] = [];
    const emails = formatLabeledList(c.emails, c.email);
    const phones = formatLabeledList(c.phones, c.phone);
    const telegrams = formatLabeledList(c.telegrams, c.telegram_chat_id);
    const qqs = formatLabeledList(c.qqs, c.qq);
    const wx = formatLabeledList(c.wxpusher_uids, c.wxpusher_uid);
    if (emails) rows.push({ icon: '📧', text: emails });
    if (phones) rows.push({ icon: '📱', text: phones });
    if (telegrams) rows.push({ icon: '✈️', text: `Telegram ${telegrams}` });
    if (qqs) rows.push({ icon: '🐧', text: `QQ ${qqs}` });
    if (wx) rows.push({ icon: '💬', text: `WxPusher ${wx}` });
    return rows;
  };

  const channelHint = (acc: NotificationAccount) => {
    if (EMAIL_CHANNEL_TYPES.has(acc.type)) {
      const list = contactFields.emails.map((e) => e.value).filter(Boolean);
      return list.length ? `→ ${list.join('、')}` : '';
    }
    if (acc.type === 'telegram') return contactFields.telegrams[0]?.value ? `→ ${contactFields.telegrams[0].value}` : '';
    if (acc.type === 'qq') return contactFields.qqs[0]?.value ? `→ ${contactFields.qqs[0].value}` : '';
    if (acc.type === 'wxpusher') return contactFields.wxpusherUids[0]?.value ? `→ ${contactFields.wxpusherUids[0].value}` : '';
    if (acc.type === 'twilio') return contactFields.phones[0]?.value ? `→ ${contactFields.phones[0].value}` : '';
    return '';
  };

  return (
    <div id="main-content" className="min-h-screen p-4 md:p-8 max-w-3xl mx-auto pb-24">
      <div className="flex items-center gap-3 mb-4">
        <Button variant="ghost" size="icon" onClick={() => { setOpen(false); setSendOpen(false); goBack(); }} aria-label="返回" className="min-h-11 min-w-11">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">固定联系人</h1>
          <p className="text-sm text-slate-500">支持多个邮箱/手机，绑定通知渠道后可快捷发信</p>
        </div>
        <Button
          onClick={() => (tab === 'contacts' ? openCreate() : setGroupOpen(true))}
          className="min-h-11"
        >
          <Plus className="w-4 h-4 mr-1" /> 添加
        </Button>
        {tab === 'contacts' && (
          <label className="inline-flex">
            <input
              type="file"
              accept=".vcf,.vcard,text/vcard"
              className="sr-only"
              disabled={importing}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) importVcard(file);
                e.target.value = '';
              }}
            />
            <Button type="button" variant="outline" className="min-h-11" disabled={importing} asChild>
              <span><Upload className="w-4 h-4 mr-1" />{importing ? '导入中…' : 'vCard'}</span>
            </Button>
          </label>
        )}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'contacts' | 'groups')} className="mb-6">
        <TabsList>
          <TabsTrigger value="contacts">联系人</TabsTrigger>
          <TabsTrigger value="groups">分组</TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <p className="text-slate-500">加载中…</p>
      ) : tab === 'contacts' ? (
        contacts.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <UserPlus className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p>暂无联系人，点击右上角添加</p>
            {accounts.length === 0 && (
              <p className="text-xs mt-2">
                请先在<button type="button" className="text-indigo-500 underline mx-1" onClick={() => navigate('/channels')}>通知渠道</button>配置邮件账号
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {contacts.map((c) => (
              <div key={c.id} className="rounded-xl border bg-white/70 dark:bg-slate-900/70 p-4 flex gap-3 items-start">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{formatContactListLabel(c)}</span>
                    {c.nickname && c.relationship && (
                      <span className="text-sm text-slate-500">昵称 {c.nickname}</span>
                    )}
                    {c.relationship && resolveRelationshipOption(c.relationship, c.name, c.nickname) && (
                      <Badge variant="outline" className="text-xs">
                        称呼：{resolveContactGreetingName(c)}
                      </Badge>
                    )}
                    {c.validation_status === 'valid' ? (
                      <Badge className="bg-green-100 text-green-700"><CheckCircle2 className="w-3 h-3 mr-1" />已验证</Badge>
                    ) : (
                      <Badge variant="outline"><AlertCircle className="w-3 h-3 mr-1" />待验证</Badge>
                    )}
                  </div>
                  <div className="text-sm text-slate-600 dark:text-slate-400 mt-1 space-y-0.5">
                    {renderContactMethods(c).map((row, i) => (
                      <div key={i}>{row.icon} {row.text}</div>
                    ))}
                  </div>
                  {(c.channel_account_ids?.length ?? 0) > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {c.channel_account_ids!.map((id) => (
                        <Badge key={id} variant="secondary" className="text-xs">
                          {getAccountName(id)}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  {canQuickSend(c) && (
                    <Button variant="ghost" size="icon" onClick={() => openQuickSend(c)} aria-label="快捷发信" className="min-h-11 min-w-11" title="快捷发信">
                      <Mail className="w-4 h-4 text-indigo-500" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" onClick={() => openEdit(c)} aria-label="编辑联系人" className="min-h-11 min-w-11">
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => remove(c.id)} aria-label="删除联系人" className="min-h-11 min-w-11">
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : groups.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p>暂无分组，用于批量邮件收件人</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <div key={g.id} className="rounded-xl border bg-white/70 dark:bg-slate-900/70 p-4">
              <h3 className="font-semibold mb-2">{g.name}</h3>
              <div className="flex flex-wrap gap-1">
                {membersFor(g.id).map((m) => (
                  <Badge key={m.email} variant="secondary">{m.email}</Badge>
                ))}
                {membersFor(g.id).length === 0 && (
                  <span className="text-xs text-slate-400">暂无成员邮箱</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? '编辑联系人' : '添加固定联系人'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input placeholder="姓名 *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-label="姓名" />
            <Input placeholder="昵称（可选，优先用于称呼）" value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">与我的关系</label>
                <select
                  className="w-full rounded-xl border p-2.5 text-sm bg-transparent"
                  value={form.relationship}
                  onChange={(e) => {
                    const relationship = e.target.value;
                    const opt = resolveRelationshipOption(relationship);
                    setForm((prev) => ({
                      ...prev,
                      relationship,
                      gender: prev.gender === 'unknown' && opt?.defaultGender ? opt.defaultGender : prev.gender,
                    }));
                  }}
                  aria-label="与我的关系"
                >
                  <option value="">未设置（按姓名+性别）</option>
                  {CONTACT_RELATIONSHIP_GROUPS.map((group) => (
                    <optgroup key={group.label} label={group.label}>
                      {group.options.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">性别</label>
                <select
                  className="w-full rounded-xl border p-2.5 text-sm bg-transparent"
                  value={form.gender}
                  onChange={(e) => setForm({ ...form, gender: e.target.value })}
                  aria-label="性别"
                >
                  {CONTACT_GENDER_OPTIONS.map((g) => (
                    <option key={g.value} value={g.value}>{g.label}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-400 mt-1">非亲属时用于先生/女士尊称</p>
              </div>
            </div>

            {(form.name || form.relationship) && (
              <p className="text-xs text-indigo-600 dark:text-indigo-400 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 px-3 py-2">
                邮件称呼预览：{resolveContactDearSalutation({
                  name: form.name,
                  nickname: form.nickname,
                  relationship: form.relationship,
                  gender: form.gender,
                })}
              </p>
            )}

            <LabeledFieldsEditor
              label="邮箱"
              placeholder="邮箱地址"
              type="email"
              entries={form.emails}
              onChange={(emails) => setForm({ ...form, emails })}
            />
            <LabeledFieldsEditor
              label="手机"
              placeholder="手机号码"
              entries={form.phones}
              onChange={(phones) => setForm({ ...form, phones })}
            />
            <LabeledFieldsEditor
              label="Telegram"
              placeholder="Chat ID"
              entries={form.telegrams}
              onChange={(telegrams) => setForm({ ...form, telegrams })}
            />
            <LabeledFieldsEditor
              label="QQ"
              placeholder="QQ 号"
              entries={form.qqs}
              onChange={(qqs) => setForm({ ...form, qqs })}
            />
            <LabeledFieldsEditor
              label="WxPusher"
              placeholder="UID_xxx"
              entries={form.wxpusherUids}
              onChange={(wxpusherUids) => setForm({ ...form, wxpusherUids })}
            />

            {accounts.length > 0 && (
              <div className="rounded-xl border p-3 space-y-2">
                <p className="text-sm font-medium">绑定通知渠道</p>
                <p className="text-xs text-slate-500">
                  勾选后，提醒与快捷发信将通过对应渠道发送。邮件类渠道使用上方邮箱作为收件地址。
                </p>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {compatibleAccounts.length === 0 ? (
                    <p className="text-xs text-amber-600">请先填写对应渠道的联系方式</p>
                  ) : (
                    compatibleAccounts.map((acc) => (
                      <label key={acc.id} className="flex items-center gap-2 text-sm cursor-pointer flex-wrap">
                        <input
                          type="checkbox"
                          checked={form.channelAccountIds.includes(acc.id)}
                          onChange={() => toggleChannelAccount(acc.id)}
                          className="rounded"
                        />
                        <span>{acc.name}</span>
                        <span className="text-xs text-slate-400">({CHANNEL_TYPE_LABELS[acc.type] || acc.type})</span>
                        {channelHint(acc) && (
                          <span className="text-xs text-slate-400">{channelHint(acc)}</span>
                        )}
                      </label>
                    ))
                  )}
                </div>
              </div>
            )}

            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button className="w-full min-h-11" onClick={save}>{editingId ? '保存' : '保存并验证'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={sendPickOpen} onOpenChange={setSendPickOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>选择收件邮箱 — {sendingContact?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-slate-500">该联系人有多个邮箱，请勾选要发送的地址（默认不全选）</p>
            <div className="space-y-2">
              {sendAvailableEmails.map((email) => (
                <label key={email} className="flex items-center gap-2 text-sm cursor-pointer rounded-lg border p-3">
                  <input
                    type="checkbox"
                    checked={sendSelectedEmails.includes(email)}
                    onChange={() => toggleSendEmail(email)}
                    className="rounded"
                  />
                  {email}
                </label>
              ))}
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button className="w-full min-h-11" disabled={sendSelectedEmails.length === 0} onClick={proceedToCompose}>
              下一步：编辑邮件
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>快捷发信 — {sendingContact?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium mb-1">收件邮箱</p>
              <p className="text-sm text-slate-600">{sendSelectedEmails.join('、')}</p>
              {sendAvailableEmails.length > 1 && (
                <button
                  type="button"
                  className="text-xs text-indigo-500 mt-1 hover:underline"
                  onClick={() => {
                    setSendOpen(false);
                    setSendPickOpen(true);
                  }}
                >
                  重新选择收件邮箱
                </button>
              )}
            </div>
            {emailAccounts.length > 1 && (
              <div>
                <label className="text-sm font-medium">通知渠道</label>
                <select
                  className="w-full mt-1 rounded-xl border p-2 text-sm bg-transparent"
                  value={sendAccountId}
                  onChange={(e) => setSendAccountId(e.target.value ? Number(e.target.value) : '')}
                >
                  {emailAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({CHANNEL_TYPE_LABELS[a.type] || a.type})
                    </option>
                  ))}
                </select>
              </div>
            )}
            <Input placeholder="邮件主题" value={sendSubject} onChange={(e) => setSendSubject(e.target.value)} />
            <textarea
              className="w-full min-h-[100px] rounded-xl border p-3 text-sm bg-transparent"
              value={sendHtml}
              onChange={(e) => setSendHtml(e.target.value)}
            />
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button className="w-full min-h-11" disabled={sending || !sendSubject || sendSelectedEmails.length === 0} onClick={quickSend}>
              <Send className="w-4 h-4 mr-2" />{sending ? '发送中…' : '发送邮件'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={groupOpen} onOpenChange={setGroupOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建联系人分组</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="分组名称 *" value={groupName} onChange={(e) => setGroupName(e.target.value)} aria-label="分组名称" />
            <textarea
              placeholder="成员邮箱，逗号或换行分隔"
              value={groupEmails}
              onChange={(e) => setGroupEmails(e.target.value)}
              className="w-full min-h-[80px] rounded-xl border p-3 text-sm"
              aria-label="成员邮箱"
            />
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button className="w-full min-h-11" onClick={saveGroup}>创建分组</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
