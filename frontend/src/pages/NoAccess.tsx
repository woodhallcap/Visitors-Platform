import { Link } from 'react-router';
import { Card } from '../components/Card';
import { PageHeader } from '../components/PageHeader';

export function NoAccess() {
  return (
    <>
      <PageHeader title="No access" />
      <Card>
        <p>Your role doesn't include this page. If you think it should, ask an administrator.</p>
        <Link to="/" className="font-semibold text-primary underline underline-offset-2">
          Go to your home page
        </Link>
      </Card>
    </>
  );
}
