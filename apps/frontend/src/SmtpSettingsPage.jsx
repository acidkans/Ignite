import { useState } from 'react';
import SmtpSettingsPanel from './components/shared/SmtpSettingsPanel';
import MailDomainsPanel from './components/shared/MailDomainsPanel';
import OrderMailDomainsPanel from './components/shared/OrderMailDomainsPanel';

// @anchor smtp-settings-page
// Panel ADMIN — globalna konfiguracja poczty wychodzącej. Cała edycja siedzi
// w `SmtpSettingsPanel`, którego ten sam układ używa zakładka „Urlopy SMTP".
// Pod nim domeny pocztowe firm (`MailDomainsPanel`) — skrzynki użytkowników dla maili zamówień —
// i przypisanie domeny do zamówień (`OrderMailDomainsPanel`).
export default function SmtpSettingsPage() {
  const [domainsVersion, setDomainsVersion] = useState(0);
  return (
    <div className="p-6 overflow-auto custom-scrollbar h-full">
      <SmtpSettingsPanel profile="singleton" />
      <MailDomainsPanel onChanged={() => setDomainsVersion((v) => v + 1)} />
      <OrderMailDomainsPanel domainsVersion={domainsVersion} />
    </div>
  );
}
