import { Card } from '../components/Card';
import { PageHeader } from '../components/PageHeader';

export function ComingSoon() {
  return (
    <>
      <PageHeader title="Coming soon" />
      <Card>
        <p className="mb-0">This part of Visitor Management is still being built. It will appear here after the next update.</p>
      </Card>
    </>
  );
}
