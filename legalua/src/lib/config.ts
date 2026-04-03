import Conf from 'conf';
import { homedir } from 'os';
import { join } from 'path';

export interface LegalConfig {
  apiKey: string;
  endpoint: string;
  format: 'text' | 'json' | 'table';
  locale: 'uk' | 'en';
}

const defaults: LegalConfig = {
  apiKey: '',
  endpoint: 'https://legal.org.ua',
  format: 'text',
  locale: 'uk',
};

const config = new Conf<LegalConfig>({
  projectName: 'legalua',
  projectSuffix: '',
  defaults,
  cwd: join(homedir(), '.config', 'legalua'),
});

export function getConfig(): LegalConfig {
  return {
    apiKey: config.get('apiKey'),
    endpoint: config.get('endpoint'),
    format: config.get('format'),
    locale: config.get('locale'),
  };
}

export function setConfig<K extends keyof LegalConfig>(key: K, value: LegalConfig[K]): void {
  config.set(key, value);
}

export function getConfigPath(): string {
  return config.path;
}

export function getAllConfig(): LegalConfig {
  return config.store;
}

export function resetConfig(): void {
  config.clear();
}
