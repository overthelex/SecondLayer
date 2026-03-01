import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  Award,
  FileText,
  Building2,
  ExternalLink,
  CheckCircle2,
  XCircle,
  GraduationCap,
} from 'lucide-react';
import { ERAUProfile } from '../services/api/ERAUService';

interface LawyerProfilePageProps {
  profile: ERAUProfile;
  onBack: () => void;
}

const ERAU_BASE_URL = 'https://erau.unba.org.ua/profile';

export function LawyerProfilePage({ profile, onBack }: LawyerProfilePageProps) {
  const initials = profile.fullName
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('');

  const hasContacts = profile.contacts.address || profile.contacts.phone || profile.contacts.email;
  const hasCertificate = profile.certificate.number || profile.certificate.date;
  const hasPractice = profile.practiceForm.type;

  return (
    <div className="flex-1 h-full overflow-y-auto bg-claude-bg p-4 md:p-8 lg:p-12">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Back Button */}
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-claude-subtext hover:text-claude-text transition-colors group"
        >
          <ArrowLeft
            size={18}
            className="group-hover:-translate-x-1 transition-transform"
          />
          <span className="font-sans text-sm">Назад до списку</span>
        </button>

        {/* Header Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="relative bg-white rounded-2xl p-6 md:p-8 border border-claude-border shadow-sm overflow-hidden"
        >
          <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-r from-claude-accent/10 to-claude-bg" />

          <div className="relative flex flex-col md:flex-row items-start md:items-end gap-6 pt-12">
            <div className="w-24 h-24 md:w-32 md:h-32 rounded-full bg-claude-sidebar border-4 border-white shadow-md flex items-center justify-center text-3xl font-serif text-claude-subtext">
              {initials}
            </div>

            <div className="flex-1 mb-2">
              <h1 className="text-3xl md:text-4xl font-serif text-claude-text font-medium tracking-tight">
                {profile.fullName}
              </h1>
              {profile.council && (
                <p className="text-claude-subtext mt-1 font-sans">
                  {profile.council}
                </p>
              )}
              {profile.experience && (
                <div className="mt-3 inline-flex items-center px-3 py-1 rounded-lg text-sm font-medium bg-claude-accent/10 text-claude-accent border border-claude-accent/20">
                  Стаж: {profile.experience}
                </div>
              )}
            </div>

            <a
              href={`${ERAU_BASE_URL}/${profile.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm text-claude-subtext hover:text-claude-accent transition-colors font-sans"
            >
              <ExternalLink size={14} />
              ЄРАУ
            </a>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Certificate Info */}
          {hasCertificate && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="bg-white rounded-2xl p-6 border border-claude-border shadow-sm"
            >
              <h2 className="text-xl font-serif text-claude-text mb-4 flex items-center gap-2">
                <FileText size={20} className="text-claude-accent" />
                Свідоцтво
              </h2>
              <div className="space-y-3">
                {profile.certificate.number && (
                  <div className="flex justify-between">
                    <span className="text-sm text-claude-subtext font-sans">Номер</span>
                    <span className="text-sm font-medium text-claude-text font-sans">
                      {profile.certificate.number}
                    </span>
                  </div>
                )}
                {profile.certificate.date && (
                  <div className="flex justify-between">
                    <span className="text-sm text-claude-subtext font-sans">Дата видачі</span>
                    <span className="text-sm font-medium text-claude-text font-sans">
                      {profile.certificate.date}
                    </span>
                  </div>
                )}
                {profile.certificate.issuedBy && (
                  <div>
                    <span className="text-sm text-claude-subtext font-sans block mb-1">Орган видачі</span>
                    <span className="text-sm text-claude-text font-sans">
                      {profile.certificate.issuedBy}
                    </span>
                  </div>
                )}
                {profile.certificate.decisionNumber && (
                  <div className="flex justify-between">
                    <span className="text-sm text-claude-subtext font-sans">Рішення</span>
                    <span className="text-sm font-medium text-claude-text font-sans">
                      {profile.certificate.decisionNumber}
                    </span>
                  </div>
                )}
                {profile.certificate.decisionDate && (
                  <div className="flex justify-between">
                    <span className="text-sm text-claude-subtext font-sans">Дата рішення</span>
                    <span className="text-sm font-medium text-claude-text font-sans">
                      {profile.certificate.decisionDate}
                    </span>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* Contact Information */}
          {hasContacts && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.15 }}
              className="bg-white rounded-2xl p-6 border border-claude-border shadow-sm"
            >
              <h2 className="text-xl font-serif text-claude-text mb-4">
                Контактна інформація
              </h2>
              <div className="space-y-3">
                {profile.contacts.address && (
                  <div className="flex items-start gap-3 text-claude-subtext">
                    <MapPin size={18} className="flex-shrink-0 mt-0.5" />
                    <span className="font-sans text-sm">{profile.contacts.address}</span>
                  </div>
                )}
                {profile.contacts.phone && (
                  <div className="flex items-center gap-3 text-claude-subtext">
                    <Phone size={18} className="flex-shrink-0" />
                    <a
                      href={`tel:${profile.contacts.phone}`}
                      className="font-sans text-sm hover:text-claude-accent transition-colors"
                    >
                      {profile.contacts.phone}
                    </a>
                  </div>
                )}
                {profile.contacts.email && (
                  <div className="flex items-center gap-3 text-claude-subtext">
                    <Mail size={18} className="flex-shrink-0" />
                    <a
                      href={`mailto:${profile.contacts.email}`}
                      className="font-sans text-sm hover:text-claude-accent transition-colors"
                    >
                      {profile.contacts.email}
                    </a>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* Practice Form */}
          {hasPractice && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="bg-white rounded-2xl p-6 border border-claude-border shadow-sm"
            >
              <h2 className="text-xl font-serif text-claude-text mb-4 flex items-center gap-2">
                <Building2 size={20} className="text-claude-accent" />
                Форма діяльності
              </h2>
              <div className="space-y-3">
                <div className="flex items-start gap-4 p-3 bg-claude-bg rounded-xl">
                  <div className="p-2 bg-white rounded-lg text-claude-accent">
                    <Award size={20} />
                  </div>
                  <div>
                    <h3 className="font-serif font-medium text-claude-text text-sm">
                      {profile.practiceForm.type}
                    </h3>
                    {profile.practiceForm.address && (
                      <p className="text-xs text-claude-subtext font-sans mt-1">
                        {profile.practiceForm.address}
                      </p>
                    )}
                    {profile.practiceForm.phone && (
                      <p className="text-xs text-claude-subtext font-sans mt-1">
                        {profile.practiceForm.phone}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Qualification */}
          {profile.qualification.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.25 }}
              className="bg-white rounded-2xl p-6 border border-claude-border shadow-sm"
            >
              <h2 className="text-xl font-serif text-claude-text mb-4 flex items-center gap-2">
                <GraduationCap size={20} className="text-claude-accent" />
                Підвищення кваліфікації
              </h2>
              <div className="space-y-2">
                {profile.qualification.map((q, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-3 border border-claude-border/50 rounded-lg"
                  >
                    <span className="text-sm font-medium text-claude-text font-sans">
                      {q.year} рік
                    </span>
                    <span className={`flex items-center gap-1.5 text-sm font-sans ${
                      q.status.toLowerCase().includes('виконано') && !q.status.toLowerCase().includes('не')
                        ? 'text-green-600'
                        : 'text-red-500'
                    }`}>
                      {q.status.toLowerCase().includes('виконано') && !q.status.toLowerCase().includes('не')
                        ? <CheckCircle2 size={14} />
                        : <XCircle size={14} />
                      }
                      {q.status}
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
