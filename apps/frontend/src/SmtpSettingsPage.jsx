import SmtpSettingsPanel from './components/shared/SmtpSettingsPanel';
import MailDomainsPanel from './components/shared/MailDomainsPanel';

// @anchor smtp-settings-page
// Panel ADMIN — globalna konfiguracja poczty wychodzącej. Cała edycja siedzi
// w `SmtpSettingsPanel`, którego ten sam układ używa zakładka „Urlopy SMTP".
// Pod nim domeny pocztowe firm (`MailDomainsPanel`) — skrzynki użytkowników dla maili zamówień.
export default function SmtpSettingsPage() {
  return (
    <div className="p-6 overflow-auto custom-scrollbar h-full">
      <SmtpSettingsPanel profile="singleton" />
      <MailDomainsPanel />
    </div>
  );
}
