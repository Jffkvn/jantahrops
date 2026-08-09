import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CompanyProfileForm } from './company-profile-form';
import { TeamSection } from './team-section';
import { ProfileSection } from './profile-section';

export function SettingsPage() {
  const [tab, setTab] = useState('company');

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        description="Your company's details, your own account, and who else has access."
        title="Settings"
      />

      <Tabs onValueChange={setTab} value={tab}>
        <TabsList className="mb-5">
          <TabsTrigger value="company">Company</TabsTrigger>
          <TabsTrigger value="profile">My account</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
        </TabsList>

        <TabsContent value="company">
          <CompanyProfileForm />
        </TabsContent>
        <TabsContent value="profile">
          <ProfileSection />
        </TabsContent>
        <TabsContent value="team">
          <TeamSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
