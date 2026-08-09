import { useEffect, useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getSupabase } from '@/lib/supabase';
import { normalizeUgandanPhone } from '@/lib/phone';
import { useAuth } from '@/features/auth/auth-provider';
import { useUpdateTeamMember } from './use-settings';

export function ProfileSection() {
  const { profile, role, updatePassword, refreshProfile } = useAuth();
  const update = useUpdateTeamMember();

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [savingDetails, setSavingDetails] = useState(false);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setFullName(profile.full_name);
    setPhone(profile.phone ?? '');
  }, [profile]);

  const saveDetails = async () => {
    if (!profile) return;
    if (!fullName.trim()) {
      setDetailsError('Your name appears on leads and tasks you own.');
      return;
    }
    const normalized = phone.trim() ? normalizeUgandanPhone(phone) : null;
    if (phone.trim() && !normalized) {
      setDetailsError('Enter a valid Ugandan phone number.');
      return;
    }
    setDetailsError(null);
    setSavingDetails(true);
    try {
      // `profiles` is updated through the shared mutation so the team list and
      // every owner picker refresh; refreshProfile updates this session's own
      // copy, which the greeting and avatar read from.
      await update.mutateAsync({ id: profile.id, patch: { full_name: fullName.trim() } });
      if ((profile.phone ?? '') !== (normalized ?? '')) {
        const { error } = await getSupabase()
          .from('profiles')
          .update({ phone: normalized })
          .eq('id', profile.id);
        if (error) throw error;
      }
      await refreshProfile();
      toast.success('Your details are saved');
    } catch {
      setDetailsError('Could not save your details. Please try again.');
    } finally {
      setSavingDetails(false);
    }
  };

  const savePassword = async () => {
    if (password.length < 8) {
      setPasswordError('Use at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setPasswordError('The two passwords do not match.');
      return;
    }
    setPasswordError(null);
    setSavingPassword(true);
    const result = await updatePassword(password);
    setSavingPassword(false);
    if (result.ok) {
      setPassword('');
      setConfirm('');
      toast.success('Password changed');
    } else {
      setPasswordError(result.message ?? 'Could not change the password.');
    }
  };

  if (!profile) return null;

  return (
    <div className="space-y-6">
      <section className="rounded-card border border-border bg-surface p-5">
        <h2 className="font-display text-md font-semibold text-ink">Your details</h2>
        <p className="mt-0.5 text-sm text-ink-secondary">
          Signed in as <span className="text-ink">{profile.email}</span>
          {role === 'admin' && (
            <span className="ml-2 inline-flex items-center gap-1 rounded-pill bg-primary-soft px-2 py-0.5 text-[11px] font-medium text-primary">
              <ShieldCheck className="h-3 w-3" />
              Admin
            </span>
          )}
        </p>

        <div className="mt-4 space-y-4">
          {detailsError && (
            <div className="rounded-control border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
              {detailsError}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="me-name">
              Full name<span className="text-danger"> *</span>
            </Label>
            <Input
              id="me-name"
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Dora Agai"
              value={fullName}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="me-phone">Phone</Label>
            <Input
              id="me-phone"
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0772 123 456"
              value={phone}
            />
          </div>

          <div className="flex justify-end">
            <Button disabled={savingDetails} onClick={() => void saveDetails()} variant="primary">
              {savingDetails && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save details
            </Button>
          </div>
        </div>
      </section>

      <section className="rounded-card border border-border bg-surface p-5">
        <h2 className="font-display text-md font-semibold text-ink">Password</h2>
        <p className="mt-0.5 text-sm text-ink-secondary">
          Changing it here signs you in with the new password from now on. You do not need
          the old one — you are already signed in.
        </p>

        <div className="mt-4 space-y-4">
          {passwordError && (
            <div className="rounded-control border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
              {passwordError}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="me-password">New password</Label>
            <Input
              autoComplete="new-password"
              id="me-password"
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              value={password}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="me-confirm">Confirm new password</Label>
            <Input
              autoComplete="new-password"
              id="me-confirm"
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void savePassword()}
              type="password"
              value={confirm}
            />
          </div>

          <div className="flex justify-end">
            <Button
              disabled={savingPassword || !password || !confirm}
              onClick={() => void savePassword()}
              variant="primary"
            >
              {savingPassword && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Change password
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
