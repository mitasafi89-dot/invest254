import { PageStub } from '@/components/PageStub';

export default function ReferralLandingPage({ params }: { params: { code: string } }) {
  return (
    <PageStub title="You're invited to PrintPesa" phase="FE6">
      <p className="text-sm text-muted">
        Referral code <span className="font-mono text-fg">{params.code}</span> will be applied at sign-up (FE6).
      </p>
    </PageStub>
  );
}
