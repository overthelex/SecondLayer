# PRIVACY POLICY

## LEX AI Platform

*Last updated: March 7, 2026*

---

Limited Liability Company "Lex AI"
EDRPOU Code: 46011385
Address: 04132, Ukraine, Kyiv, 47-Sadova, 1a
Email: info@legal.org.ua
Data Protection Contact: info@legal.org.ua

## 1. Introduction

This Privacy Policy describes how LLC "Lex AI" (hereinafter — "Company", "we") collects, processes, stores, and protects personal data of users of the LEX AI service (hereinafter — "Service").

The Company processes personal data in accordance with:
- the Law of Ukraine "On Personal Data Protection" (No. 2297-VI);
- the General Data Protection Regulation (GDPR, Regulation 2016/679) — for EU/EEA users;
- other applicable regulations.

By using the Service, you confirm that you have read this Policy and consent to the processing of your personal data as described below.

## 2. Data We Collect

**2.1. Data you provide directly:**
- name, surname, email (during registration);
- profile photo (when authorizing via Google or Diia);
- documents you upload for AI analysis;
- text queries to the AI system;
- comments on blog articles.

**2.2. Data collected automatically:**
- IP address and approximate geolocation;
- browser type and operating system;
- session time and duration;
- actions within the Service interface (pages viewed, tools used);
- API usage (number of requests, tool types).

**2.3. Data from third parties:**
- Google profile (name, email, photo) — when authorizing via Google OAuth;
- Diia.Signature data (full name, tax ID) — when authorizing via Diia;
- payment information from Monobank (transaction status, without card number).

## 3. Purposes of Data Processing

We process personal data for the following purposes:

**3.1. Service provision:**
- creating and managing user accounts;
- performing AI analysis of uploaded documents;
- semantic search and retrieval of legal information;
- storing documents in the secure vault.

**3.2. Security and quality:**
- protection against unauthorized access;
- monitoring service quality and performance;
- detecting and preventing abuse.

**3.3. Communication:**
- sending service notifications (registration confirmation, password reset);
- notifying about changes to Terms or Policy.

**3.4. Legal obligations:**
- compliance with legal requirements;
- accounting records (payment data).

## 4. Legal Basis for Processing (GDPR)

For EU/EEA users, we process data based on:
- **Consent** (Art. 6(1)(a) GDPR) — for optional features and marketing;
- **Performance of contract** (Art. 6(1)(b) GDPR) — for providing the Service;
- **Legitimate interest** (Art. 6(1)(f) GDPR) — for security and Service improvement;
- **Legal obligation** (Art. 6(1)(c) GDPR) — for compliance with legal requirements.

## 5. Document Processing via AI (OpenAI)

**IMPORTANT:** When using AI analysis, the content of your documents and queries is transmitted to the OpenAI API for processing.

Terms of data processing through OpenAI:
- OpenAI acts as a sub-processor and processes data solely according to our instructions;
- OpenAI does **NOT** use API data for training its models (by default since March 1, 2023);
- data is retained by OpenAI for up to 30 days solely for abuse monitoring, after which it is deleted;
- processing is governed by a Data Processing Addendum (DPA) between the Company and OpenAI;
- OpenAI holds SOC 2 Type 2 certification.

Recommendations for users:
- do not upload documents with particularly sensitive personal data (medical, financial) unless necessary for analysis;
- anonymize documents before uploading when possible;
- contact us if you require additional safeguards for processing sensitive data.

## 6. Data Storage and Security

**6.1. Where data is stored:**
- user accounts and metadata — PostgreSQL (encrypted connections);
- documents — MinIO (S3-compatible storage with encryption);
- vector embeddings — Qdrant (for semantic search);
- session cache — Redis (temporary storage).

**6.2. Security measures:**
- data encryption in transit (TLS 1.2+);
- JWT token authentication;
- role-based access control;
- audit log with hash chain for access tracking;
- data isolation between clients (matter segregation);
- regular backups.

**6.3. Retention periods:**
- account data — duration of the account + 30 days after deletion;
- uploaded documents — duration of the account, deleted upon request;
- usage logs — 90 days;
- payment data — 5 years (legal requirement);
- AI query data — 30 days (OpenAI abuse monitoring).

## 7. Data Sharing with Third Parties

We share personal data exclusively with the following categories of recipients:

**7.1. Sub-processors:**
- OpenAI, LP (USA) — AI analysis of documents and queries;
- Monobank / JSC "Universal Bank" (Ukraine) — payment processing;
- Cloudflare, Inc. (USA) — CDN and DDoS protection;
- Hetzner Online GmbH (Germany) — server hosting.

**7.2. Government authorities:**
- upon court order or lawful request in accordance with Ukrainian law.

We do **NOT** sell or share personal data for third-party marketing purposes.

For data transfers outside the EU/EEA, we use Standard Contractual Clauses (SCCs) pursuant to European Commission decisions.

## 8. Your Rights

Under applicable law and the GDPR, you have the following rights:

- **Right of access** (Art. 15 GDPR) — obtain information about what data we process;
- **Right to rectification** (Art. 16 GDPR) — correct inaccurate data;
- **Right to erasure** (Art. 17 GDPR) — request complete deletion of your data;
- **Right to restriction** (Art. 18 GDPR) — restrict processing of your data;
- **Right to data portability** (Art. 20 GDPR) — receive your data in a structured format;
- **Right to object** (Art. 21 GDPR) — object to processing based on legitimate interest;
- **Right to withdraw consent** — at any time without affecting the lawfulness of prior processing.

To exercise these rights:
- Data export: Profile → Privacy & Data → Export;
- Account deletion: Profile → Privacy & Data → Delete;
- Other requests: info@legal.org.ua.

We respond to requests within 30 days.

You also have the right to lodge a complaint with the Ukrainian Parliament Commissioner for Human Rights (Ukraine) or the supervisory authority in your EU country.

## 9. Cookies

The Service uses:
- **essential cookies** — for authentication and session support (JWT tokens);
- **functional cookies** — for storing language settings and interface preferences.

We do **NOT** use third-party advertising or analytics cookies. We do **NOT** track users across other websites.

## 10. Children's Data Protection

The Service is not intended for persons under the age of 18. We do not knowingly collect personal data from minors. If you believe a minor has provided us with their data, please contact us for its deletion.

## 11. Changes to This Policy

We may update this Privacy Policy. We will notify you of material changes:
- via the email registered with your account;
- through notifications in the Service interface;
- at least 14 days before the changes take effect.

Continued use of the Service after changes constitutes acceptance of the updated Policy.

## 12. Contact Information

For data protection inquiries, please contact:

LLC "Lex AI"
EDRPOU: 46011385
Address: 04132, Ukraine, Kyiv, 47-Sadova, 1a
Email: info@legal.org.ua
Website: https://legal.org.ua
