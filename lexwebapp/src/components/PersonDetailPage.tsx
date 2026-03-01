import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  Briefcase,
  Award,
  TrendingUp,
  FileText,
} from 'lucide-react';
interface PersonDetailPageProps {
  type: 'judge' | 'lawyer';
  person: {
    id: string;
    name: string;
    position: string;
    cases: number;
    successRate: number;
    specialization: string;
  };
  onBack: () => void;
}
export function PersonDetailPage({
  type,
  person,
  onBack
}: PersonDetailPageProps) {
  const isJudge = type === 'judge';
  return (
    <div className="flex-1 h-full overflow-y-auto bg-claude-bg p-4 md:p-8 lg:p-12">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Back Button */}
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-claude-subtext hover:text-claude-text transition-colors group">

          <ArrowLeft
            size={18}
            className="group-hover:-translate-x-1 transition-transform" />

          <span className="font-sans text-sm">Назад до списку</span>
        </button>

        {/* Header Section */}
        <motion.div
          initial={{
            opacity: 0,
            y: 20
          }}
          animate={{
            opacity: 1,
            y: 0
          }}
          transition={{
            duration: 0.5,
            ease: [0.22, 1, 0.36, 1]
          }}
          className="relative bg-white rounded-2xl p-6 md:p-8 border border-claude-border shadow-sm overflow-hidden">

          <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-r from-claude-accent/10 to-claude-bg" />

          <div className="relative flex flex-col md:flex-row items-start md:items-end gap-6 pt-12">
            <div className="w-24 h-24 md:w-32 md:h-32 rounded-full bg-claude-sidebar border-4 border-white shadow-md flex items-center justify-center text-3xl font-serif text-claude-subtext">
              {person.name.
              split(' ').
              map((n) => n[0]).
              slice(0, 2).
              join('')}
            </div>

            <div className="flex-1 mb-2">
              <h1 className="text-3xl md:text-4xl font-serif text-claude-text font-medium tracking-tight">
                {person.name}
              </h1>
              <p className="text-claude-subtext mt-1 font-sans">
                {person.position}
              </p>
              <div className="mt-3 inline-flex items-center px-3 py-1 rounded-lg text-sm font-medium bg-claude-accent/10 text-claude-accent border border-claude-accent/20">
                {person.specialization}
              </div>
            </div>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Contact Information */}
          <motion.div
            initial={{
              opacity: 0,
              y: 20
            }}
            animate={{
              opacity: 1,
              y: 0
            }}
            transition={{
              duration: 0.5,
              delay: 0.1
            }}
            className="bg-white rounded-2xl p-6 border border-claude-border shadow-sm">

            <h2 className="text-xl font-serif text-claude-text mb-4">
              Контактна інформація
            </h2>
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-claude-subtext">
                <Mail size={18} className="flex-shrink-0" />
                <span className="font-sans text-sm">
                  {person.name.toLowerCase().replace(/\s+/g, '.')}@example.ua
                </span>
              </div>
              <div className="flex items-center gap-3 text-claude-subtext">
                <Phone size={18} className="flex-shrink-0" />
                <span className="font-sans text-sm">+380 (44) 123-45-67</span>
              </div>
              <div className="flex items-center gap-3 text-claude-subtext">
                <MapPin size={18} className="flex-shrink-0" />
                <span className="font-sans text-sm">
                  м. Київ, вул. Хрещатик, 1
                </span>
              </div>
            </div>
          </motion.div>

          {/* Statistics */}
          <motion.div
            initial={{
              opacity: 0,
              y: 20
            }}
            animate={{
              opacity: 1,
              y: 0
            }}
            transition={{
              duration: 0.5,
              delay: 0.2
            }}
            className="bg-white rounded-2xl p-6 border border-claude-border shadow-sm">

            <h2 className="text-xl font-serif text-claude-text mb-4">
              Статистика
            </h2>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-claude-subtext font-sans">
                    Всього справ
                  </span>
                  <span className="font-serif font-medium text-claude-text">
                    {person.cases}
                  </span>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-claude-subtext font-sans">
                    {isJudge ? 'Задоволення' : 'Успішність'}
                  </span>
                  <span className="font-serif font-medium text-claude-text">
                    {person.successRate}%
                  </span>
                </div>
                <div className="h-2 w-full bg-claude-bg rounded-full overflow-hidden">
                  <div
                    className="h-full bg-claude-accent"
                    style={{
                      width: `${person.successRate}%`
                    }}>
                  </div>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-claude-subtext font-sans">
                    Середня тривалість
                  </span>
                  <span className="font-serif font-medium text-claude-text">
                    4.2 міс.
                  </span>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Professional Experience */}
          <motion.div
            initial={{
              opacity: 0,
              y: 20
            }}
            animate={{
              opacity: 1,
              y: 0
            }}
            transition={{
              duration: 0.5,
              delay: 0.3
            }}
            className="bg-white rounded-2xl p-6 border border-claude-border shadow-sm md:col-span-2">

            <h2 className="text-xl font-serif text-claude-text mb-4">
              {isJudge ? 'Судова практика' : 'Професійний досвід'}
            </h2>
            <div className="space-y-4">
              <div className="flex items-start gap-4 p-4 bg-claude-bg rounded-xl">
                <div className="p-2 bg-white rounded-lg text-claude-accent">
                  <Briefcase size={20} />
                </div>
                <div>
                  <h3 className="font-serif font-medium text-claude-text mb-1">
                    {isJudge ? 'Категорії справ' : 'Спеціалізація'}
                  </h3>
                  <p className="text-sm text-claude-subtext font-sans">
                    {person.specialization}, корпоративні спори, договірне
                    право
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4 p-4 bg-claude-bg rounded-xl">
                <div className="p-2 bg-white rounded-lg text-claude-accent">
                  <Award size={20} />
                </div>
                <div>
                  <h3 className="font-serif font-medium text-claude-text mb-1">
                    {isJudge ? 'Найбільш цитовані рішення' : 'Досягнення'}
                  </h3>
                  <p className="text-sm text-claude-subtext font-sans">
                    {isJudge ?
                    'Постанова від 15.03.2023 у справі №910/12345/23, Ухвала від 22.06.2023' :
                    'Перемога у 85% господарських спорів, успішне представництво у ВС'}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4 p-4 bg-claude-bg rounded-xl">
                <div className="p-2 bg-white rounded-lg text-claude-accent">
                  <TrendingUp size={20} />
                </div>
                <div>
                  <h3 className="font-serif font-medium text-claude-text mb-1">
                    {isJudge ? 'Тенденції' : 'Підхід до справ'}
                  </h3>
                  <p className="text-sm text-claude-subtext font-sans">
                    {isJudge ?
                    'Останній рік: більш суворий підхід до оцінки доказів, часте застосування ст. 551 ЦК України' :
                    'Агресивна процесуальна тактика, акцент на формальних порушеннях, ефективне використання строків'}
                  </p>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Recent Activity */}
          <motion.div
            initial={{
              opacity: 0,
              y: 20
            }}
            animate={{
              opacity: 1,
              y: 0
            }}
            transition={{
              duration: 0.5,
              delay: 0.4
            }}
            className="bg-white rounded-2xl p-6 border border-claude-border shadow-sm md:col-span-2">

            <h2 className="text-xl font-serif text-claude-text mb-4">
              Останні справи
            </h2>
            <div className="space-y-3">
              {[1, 2, 3].map((i) =>
              <div
                key={i}
                className="flex items-center justify-between p-3 border border-claude-border/50 rounded-lg hover:bg-claude-bg/50 transition-colors">

                  <div className="flex items-center gap-3">
                    <FileText size={16} className="text-claude-subtext" />
                    <div>
                      <div className="font-medium text-claude-text font-sans text-sm">
                        Справа №910/{12345 + i}/24
                      </div>
                      <div className="text-xs text-claude-subtext font-sans">
                        {person.specialization}
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-claude-subtext font-sans">
                    {new Date(2024, 0, 15 - i).toLocaleDateString('uk-UA')}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </div>);

}
