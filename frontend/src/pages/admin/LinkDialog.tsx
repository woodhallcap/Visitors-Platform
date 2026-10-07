import { Button } from '../../components/Button';
import { CopyLink } from '../../components/CopyLink';
import { Dialog } from '../../components/Dialog';
import { formatDateTime } from '../../lib/format';
import type { SetPasswordLink, User } from '../../types';

interface LinkDialogProps {
  user: User;
  link: SetPasswordLink;
  onClose: () => void;
}

export function LinkDialog({ user, link, onClose }: LinkDialogProps) {
  return (
    <Dialog title="Set-password link" onClose={onClose}>
      <p>
        Send this link to <strong>{user.full_name}</strong> ({user.email}) through Teams, WhatsApp or in person.{' '}
        {link.purpose === 'invite' ? 'They will use it to set their password.' : 'They will use it to choose a new password.'}
      </p>
      <CopyLink url={link.set_password_url} />
      <p className="mt-3 text-sm text-ink/70">It works once and expires {formatDateTime(link.expires_at)} (WAT). This is the only time it is shown.</p>
      <div className="mt-6 flex justify-end">
        <Button onClick={onClose}>Done</Button>
      </div>
    </Dialog>
  );
}
