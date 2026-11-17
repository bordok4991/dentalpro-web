import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { daysUntil, useI18n, type Key } from '../lib/i18n';
import { errorKey } from '../lib/errors';
import { inviteLink } from '../lib/api';
import { api, useSession } from '../lib/session';
import { INVITABLE_ROLES, ROLES, type Invite, type Member, type Role } from '../lib/types';
import { Avatar } from '../components/Avatar';
import { Button, Field, Loading, Notice, SelectField } from '../components/ui';

function hasSpecialty(role: Role): boolean {
  return role === 'specialist' || role === 'doctor';
}

export function Team() {
  const { t } = useI18n();
  const { current, user } = useSession();
  const clinicId = current?.clinic.id ?? '';
  const isOwner = current?.role === 'owner';

  const [members, setMembers] = useState<Member[] | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [error, setError] = useState<Key | null>(null);
  const [inviting, setInviting] = useState(false);
  const [fresh, setFresh] = useState<Invite | null>(null);

  const load = useCallback(async () => {
    if (!clinicId) return;
    try {
      const [m, i] = await Promise.all([api.members(clinicId), isOwner ? api.invites(clinicId) : Promise.resolve([])]);
      setMembers(m);
      setInvites(i);
    } catch (e) {
      setError(errorKey(e));
    }
  }, [clinicId, isOwner]);

  useEffect(() => {
    setMembers(null);
    setFresh(null);
    setError(null);
    void load();
  }, [load]);

  /** Izvrši izmjenu, pa ponovo učitaj spisak; greška se prikazuje na vrhu. */
  async function act(fn: () => Promise<void>) {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorKey(e));
    }
    await load();
  }

  if (!current) return null;

  return (
    <>
      <header className="page-head page-head-row">
        <div>
          <h1>{t('team.title')}</h1>
          <p className="lead">{t('team.lead')}</p>
        </div>
        {isOwner && !inviting && (
          <Button
            onClick={() => {
              setInviting(true);
              setFresh(null);
            }}
          >
            {t('team.invite')}
          </Button>
        )}
      </header>

      {error && <Notice kind="error">{t(error)}</Notice>}
      {!isOwner && <Notice kind="info">{t('team.readOnly')}</Notice>}

      {isOwner && inviting && (
        <InviteForm
          clinicId={clinicId}
          onCancel={() => setInviting(false)}
          onCreated={(inv) => {
            setInviting(false);
            setFresh(inv);
            void load();
          }}
        />
      )}

      {fresh && (
        <section className="block block-accent" aria-live="polite">
          <p>{t('team.inviteReady')}</p>
          <CopyLink token={fresh.token} />
        </section>
      )}

      <section className="block">
        <h2>{t('team.members')}</h2>
        {members === null ? (
          <Loading />
        ) : (
          <ul className="rows">
            {members.filter((m) => m.role !== 'patient').map((m) => (
              <MemberRow key={m.id} member={m} isSelf={m.user_id === user?.id} canEdit={isOwner} act={act} />
            ))}
          </ul>
        )}
      </section>

      {isOwner && (
        <section className="block">
          <h2>{t('team.invites')}</h2>
          {invites.length === 0 ? (
            <p className="muted">{t('team.noInvites')}</p>
          ) : (
            <ul className="rows">
              {invites.map((inv) => (
                <InviteRow key={inv.id} invite={inv} onRevoke={() => act(() => api.revokeInvite(inv.id))} />
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}

function InviteForm({ clinicId, onCancel, onCreated }: { clinicId: string; onCancel: () => void; onCreated: (i: Invite) => void }) {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('doctor');
  const [specialty, setSpecialty] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Key | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('err.email');
      return;
    }
    setBusy(true);
    try {
      onCreated(await api.createInvite({ clinicId, email, role, specialty: hasSpecialty(role) ? specialty : undefined }));
    } catch (err) {
      setError(errorKey(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="block block-form" onSubmit={submit}>
      <h2>{t('team.inviteTitle')}</h2>
      <p className="lead">{t('team.inviteLead')}</p>
      <p className="hint">{t('team.patientsFromKarton')}</p>
      {error && <Notice kind="error">{t(error)}</Notice>}
      <div className="grid-2">
        <Field label={t('team.inviteEmail')} type="email" autoComplete="off" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <SelectField label={t('team.role')} value={role} onChange={(e) => setRole(e.target.value as Role)}>
          {INVITABLE_ROLES.filter((r) => r !== 'patient').map((r) => (
            <option key={r} value={r}>
              {t(`role.${r}`)}
            </option>
          ))}
        </SelectField>
        {hasSpecialty(role) && (
          <Field label={t('team.specialty')} hint={t('team.specialtyHint')} value={specialty} onChange={(e) => setSpecialty(e.target.value)} />
        )}
      </div>
      <div className="row">
        <Button type="submit" busy={busy}>
          {t('team.createInvite')}
        </Button>
        <Button variant="quiet" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}

function CopyLink({ token }: { token: string }) {
  const { t } = useI18n();
  const link = inviteLink(token);
  const input = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // Bez dozvole za međuspremnik: označi tekst da ga korisnik sam kopira.
      input.current?.focus();
      input.current?.select();
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="copy">
      <input ref={input} readOnly value={link} aria-label={t('team.copyLink')} onFocus={(e) => e.currentTarget.select()} />
      <Button variant="quiet" onClick={() => void copy()}>
        {copied ? t('team.copied') : t('team.copyLink')}
      </Button>
    </div>
  );
}

function InviteRow({ invite, onRevoke }: { invite: Invite; onRevoke: () => void }) {
  const { t, days } = useI18n();
  const expired = new Date(invite.expires_at).getTime() < Date.now();
  return (
    <li className="rowitem">
      <div className="rowitem-main">
        <strong>{invite.email}</strong>
        <span className="meta">
          {t(`role.${invite.role}`)}
          {invite.specialty ? `, ${invite.specialty}` : ''}
        </span>
        <span className={expired ? 'tag tag-warn' : 'meta'}>{expired ? t('team.expired') : t('team.expires', { days: days(daysUntil(invite.expires_at)) })}</span>
      </div>
      <div className="rowitem-actions">
        <Button variant="quiet" onClick={onRevoke}>
          {t('team.revoke')}
        </Button>
      </div>
      {!expired && <CopyLink token={invite.token} />}
    </li>
  );
}

function MemberRow({ member, isSelf, canEdit, act }: { member: Member; isSelf: boolean; canEdit: boolean; act: (fn: () => Promise<void>) => Promise<void> }) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [role, setRole] = useState<Role>(member.role);
  const [specialty, setSpecialty] = useState(member.specialty ?? '');
  const [busy, setBusy] = useState(false);

  const name = member.profile?.full_name.trim() || t('team.noName');

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    await act(fn);
    setBusy(false);
    setEditing(false);
    setConfirming(false);
  }

  return (
    <li className={`rowitem rowitem-person${member.is_active ? '' : ' rowitem-off'}`}>
      <Avatar url={member.profile?.avatar_url} name={name} size={44} />
      <div className="rowitem-main">
        <strong>
          {name}
          {isSelf && <span className="tag">{t('team.you')}</span>}
          {!member.is_active && <span className="tag tag-warn">{t('team.inactive')}</span>}
        </strong>
        {member.profile?.email && <span className="meta">{member.profile.email}</span>}
        <span className="meta">
          {t(`role.${member.role}`)}
          {member.specialty ? `, ${member.specialty}` : ''}
        </span>
      </div>

      {canEdit && !isSelf && !editing && (
        <div className="rowitem-actions">
          <Button variant="quiet" onClick={() => setEditing(true)}>
            {t('team.editMember')}
          </Button>
        </div>
      )}

      {canEdit && !isSelf && editing && (
        <div className="rowitem-edit">
          <div className="grid-2">
            <SelectField label={t('team.role')} value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {t(`role.${r}`)}
                </option>
              ))}
            </SelectField>
            {hasSpecialty(role) && <Field label={t('team.specialty')} value={specialty} onChange={(e) => setSpecialty(e.target.value)} />}
          </div>
          <div className="row">
            <Button busy={busy} onClick={() => run(() => api.updateMember(member.id, { role, specialty: hasSpecialty(role) ? specialty.trim() || null : null }))}>
              {t('team.saveMember')}
            </Button>
            <Button variant="quiet" disabled={busy} onClick={() => run(() => api.updateMember(member.id, { is_active: !member.is_active }))}>
              {member.is_active ? t('team.deactivate') : t('team.activate')}
            </Button>
            {confirming ? (
              <Button variant="danger" disabled={busy} onClick={() => run(() => api.removeMember(member.id))}>
                {t('team.confirmRemove')}
              </Button>
            ) : (
              <Button variant="quiet" disabled={busy} onClick={() => setConfirming(true)}>
                {t('team.remove')}
              </Button>
            )}
            <Button
              variant="quiet"
              disabled={busy}
              onClick={() => {
                setEditing(false);
                setConfirming(false);
                setRole(member.role);
                setSpecialty(member.specialty ?? '');
              }}
            >
              {t('common.cancel')}
            </Button>
          </div>
          {confirming && <p className="hint">{t('team.removeNote')}</p>}
        </div>
      )}
    </li>
  );
}
