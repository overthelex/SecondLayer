-- Migration 059: Add AWS Bedrock models to service_pricing
-- Bedrock pricing from https://aws.amazon.com/bedrock/pricing/ (us-east-1, on-demand)
-- Model IDs from: aws bedrock list-foundation-models --region us-east-1

-- ── Amazon Nova family ──────────────────────────────────────────────────────

INSERT INTO service_pricing (provider, model, display_name, unit_type, price_usd, currency, sort_order, notes) VALUES
  -- Nova Micro (text-only, 128K context)
  ('bedrock', 'amazon.nova-micro-v1:0',   'Amazon Nova Micro',   'per_1m_input_tokens',  0.035,  'USD', 10, 'Текстова модель, 128K контекст'),
  ('bedrock', 'amazon.nova-micro-v1:0',   'Amazon Nova Micro',   'per_1m_output_tokens', 0.14,   'USD', 11, NULL),
  -- Nova Lite (multimodal, 300K context)
  ('bedrock', 'amazon.nova-lite-v1:0',    'Amazon Nova Lite',    'per_1m_input_tokens',  0.06,   'USD', 20, 'Мультимодальна, 300K контекст'),
  ('bedrock', 'amazon.nova-lite-v1:0',    'Amazon Nova Lite',    'per_1m_output_tokens', 0.24,   'USD', 21, NULL),
  -- Nova Pro (multimodal, 300K context)
  ('bedrock', 'amazon.nova-pro-v1:0',     'Amazon Nova Pro',     'per_1m_input_tokens',  0.80,   'USD', 30, 'Мультимодальна, 300K контекст'),
  ('bedrock', 'amazon.nova-pro-v1:0',     'Amazon Nova Pro',     'per_1m_output_tokens', 3.20,   'USD', 31, NULL),
  -- Nova Premier (multimodal, 1M context)
  ('bedrock', 'amazon.nova-premier-v1:0', 'Amazon Nova Premier', 'per_1m_input_tokens',  2.50,   'USD', 40, 'Мультимодальна, 1M контекст'),
  ('bedrock', 'amazon.nova-premier-v1:0', 'Amazon Nova Premier', 'per_1m_output_tokens', 12.50,  'USD', 41, NULL),
  -- Nova 2 Lite (multimodal, 256K context)
  ('bedrock', 'amazon.nova-2-lite-v1:0',  'Amazon Nova 2 Lite',  'per_1m_input_tokens',  0.04,   'USD', 50, 'Мультимодальна нового покоління, 256K контекст'),
  ('bedrock', 'amazon.nova-2-lite-v1:0',  'Amazon Nova 2 Lite',  'per_1m_output_tokens', 0.16,   'USD', 51, NULL)
ON CONFLICT (provider, model, unit_type) DO NOTHING;

-- ── Anthropic Claude on Bedrock ─────────────────────────────────────────────

INSERT INTO service_pricing (provider, model, display_name, unit_type, price_usd, currency, sort_order, notes) VALUES
  -- Claude 3 Haiku
  ('bedrock', 'anthropic.claude-3-haiku-20240307-v1:0', 'Claude 3 Haiku (Bedrock)',   'per_1m_input_tokens',  0.25,  'USD', 100, NULL),
  ('bedrock', 'anthropic.claude-3-haiku-20240307-v1:0', 'Claude 3 Haiku (Bedrock)',   'per_1m_output_tokens', 1.25,  'USD', 101, NULL),
  -- Claude 3.5 Haiku
  ('bedrock', 'anthropic.claude-3-5-haiku-20241022-v1:0', 'Claude 3.5 Haiku (Bedrock)', 'per_1m_input_tokens',  0.80,  'USD', 110, NULL),
  ('bedrock', 'anthropic.claude-3-5-haiku-20241022-v1:0', 'Claude 3.5 Haiku (Bedrock)', 'per_1m_output_tokens', 4.00,  'USD', 111, NULL),
  -- Claude Haiku 4.5
  ('bedrock', 'anthropic.claude-haiku-4-5-20251001-v1:0', 'Claude Haiku 4.5 (Bedrock)', 'per_1m_input_tokens',  1.00,  'USD', 120, NULL),
  ('bedrock', 'anthropic.claude-haiku-4-5-20251001-v1:0', 'Claude Haiku 4.5 (Bedrock)', 'per_1m_output_tokens', 5.00,  'USD', 121, NULL),
  -- Claude 3 Sonnet
  ('bedrock', 'anthropic.claude-3-sonnet-20240229-v1:0', 'Claude 3 Sonnet (Bedrock)',  'per_1m_input_tokens',  3.00,  'USD', 130, NULL),
  ('bedrock', 'anthropic.claude-3-sonnet-20240229-v1:0', 'Claude 3 Sonnet (Bedrock)',  'per_1m_output_tokens', 15.00, 'USD', 131, NULL),
  -- Claude 3.5 Sonnet v2
  ('bedrock', 'anthropic.claude-3-5-sonnet-20241022-v2:0', 'Claude 3.5 Sonnet v2 (Bedrock)', 'per_1m_input_tokens',  3.00,  'USD', 140, NULL),
  ('bedrock', 'anthropic.claude-3-5-sonnet-20241022-v2:0', 'Claude 3.5 Sonnet v2 (Bedrock)', 'per_1m_output_tokens', 15.00, 'USD', 141, NULL),
  -- Claude 3.7 Sonnet
  ('bedrock', 'anthropic.claude-3-7-sonnet-20250219-v1:0', 'Claude 3.7 Sonnet (Bedrock)',    'per_1m_input_tokens',  3.00,  'USD', 150, NULL),
  ('bedrock', 'anthropic.claude-3-7-sonnet-20250219-v1:0', 'Claude 3.7 Sonnet (Bedrock)',    'per_1m_output_tokens', 15.00, 'USD', 151, NULL),
  -- Claude Sonnet 4
  ('bedrock', 'anthropic.claude-sonnet-4-20250514-v1:0', 'Claude Sonnet 4 (Bedrock)',  'per_1m_input_tokens',  3.00,  'USD', 160, NULL),
  ('bedrock', 'anthropic.claude-sonnet-4-20250514-v1:0', 'Claude Sonnet 4 (Bedrock)',  'per_1m_output_tokens', 15.00, 'USD', 161, NULL),
  -- Claude Sonnet 4.5
  ('bedrock', 'anthropic.claude-sonnet-4-5-20250929-v1:0', 'Claude Sonnet 4.5 (Bedrock)', 'per_1m_input_tokens',  3.00,  'USD', 170, NULL),
  ('bedrock', 'anthropic.claude-sonnet-4-5-20250929-v1:0', 'Claude Sonnet 4.5 (Bedrock)', 'per_1m_output_tokens', 15.00, 'USD', 171, NULL),
  -- Claude Sonnet 4.6
  ('bedrock', 'anthropic.claude-sonnet-4-6', 'Claude Sonnet 4.6 (Bedrock)', 'per_1m_input_tokens',  3.00,  'USD', 175, NULL),
  ('bedrock', 'anthropic.claude-sonnet-4-6', 'Claude Sonnet 4.6 (Bedrock)', 'per_1m_output_tokens', 15.00, 'USD', 176, NULL),
  -- Claude Opus 4
  ('bedrock', 'anthropic.claude-opus-4-20250514-v1:0', 'Claude Opus 4 (Bedrock)',   'per_1m_input_tokens',  15.00, 'USD', 180, NULL),
  ('bedrock', 'anthropic.claude-opus-4-20250514-v1:0', 'Claude Opus 4 (Bedrock)',   'per_1m_output_tokens', 75.00, 'USD', 181, NULL),
  -- Claude Opus 4.5
  ('bedrock', 'anthropic.claude-opus-4-5-20251101-v1:0', 'Claude Opus 4.5 (Bedrock)', 'per_1m_input_tokens',  15.00, 'USD', 190, NULL),
  ('bedrock', 'anthropic.claude-opus-4-5-20251101-v1:0', 'Claude Opus 4.5 (Bedrock)', 'per_1m_output_tokens', 75.00, 'USD', 191, NULL),
  -- Claude Opus 4.6
  ('bedrock', 'anthropic.claude-opus-4-6-v1', 'Claude Opus 4.6 (Bedrock)', 'per_1m_input_tokens',  15.00, 'USD', 195, NULL),
  ('bedrock', 'anthropic.claude-opus-4-6-v1', 'Claude Opus 4.6 (Bedrock)', 'per_1m_output_tokens', 75.00, 'USD', 196, NULL)
ON CONFLICT (provider, model, unit_type) DO NOTHING;

-- ── Meta Llama on Bedrock ───────────────────────────────────────────────────

INSERT INTO service_pricing (provider, model, display_name, unit_type, price_usd, currency, sort_order, notes) VALUES
  -- Llama 3.2 1B
  ('bedrock', 'meta.llama3-2-1b-instruct-v1:0', 'Llama 3.2 1B Instruct',  'per_1m_input_tokens',  0.10,  'USD', 200, NULL),
  ('bedrock', 'meta.llama3-2-1b-instruct-v1:0', 'Llama 3.2 1B Instruct',  'per_1m_output_tokens', 0.10,  'USD', 201, NULL),
  -- Llama 3.2 3B
  ('bedrock', 'meta.llama3-2-3b-instruct-v1:0', 'Llama 3.2 3B Instruct',  'per_1m_input_tokens',  0.15,  'USD', 210, NULL),
  ('bedrock', 'meta.llama3-2-3b-instruct-v1:0', 'Llama 3.2 3B Instruct',  'per_1m_output_tokens', 0.15,  'USD', 211, NULL),
  -- Llama 3.3 70B
  ('bedrock', 'meta.llama3-3-70b-instruct-v1:0', 'Llama 3.3 70B Instruct', 'per_1m_input_tokens',  0.72,  'USD', 220, NULL),
  ('bedrock', 'meta.llama3-3-70b-instruct-v1:0', 'Llama 3.3 70B Instruct', 'per_1m_output_tokens', 0.72,  'USD', 221, NULL),
  -- Llama 4 Scout 17B
  ('bedrock', 'meta.llama4-scout-17b-instruct-v1:0', 'Llama 4 Scout 17B',  'per_1m_input_tokens',  0.17,  'USD', 230, NULL),
  ('bedrock', 'meta.llama4-scout-17b-instruct-v1:0', 'Llama 4 Scout 17B',  'per_1m_output_tokens', 0.66,  'USD', 231, NULL),
  -- Llama 4 Maverick 17B
  ('bedrock', 'meta.llama4-maverick-17b-instruct-v1:0', 'Llama 4 Maverick 17B', 'per_1m_input_tokens',  0.24,  'USD', 240, NULL),
  ('bedrock', 'meta.llama4-maverick-17b-instruct-v1:0', 'Llama 4 Maverick 17B', 'per_1m_output_tokens', 0.97,  'USD', 241, NULL)
ON CONFLICT (provider, model, unit_type) DO NOTHING;

-- ── Mistral AI on Bedrock ───────────────────────────────────────────────────

INSERT INTO service_pricing (provider, model, display_name, unit_type, price_usd, currency, sort_order, notes) VALUES
  -- Mistral 7B
  ('bedrock', 'mistral.mistral-7b-instruct-v0:2',   'Mistral 7B Instruct',   'per_1m_input_tokens',  0.15,  'USD', 300, NULL),
  ('bedrock', 'mistral.mistral-7b-instruct-v0:2',   'Mistral 7B Instruct',   'per_1m_output_tokens', 0.20,  'USD', 301, NULL),
  -- Mixtral 8x7B
  ('bedrock', 'mistral.mixtral-8x7b-instruct-v0:1', 'Mixtral 8x7B Instruct', 'per_1m_input_tokens',  0.45,  'USD', 310, NULL),
  ('bedrock', 'mistral.mixtral-8x7b-instruct-v0:1', 'Mixtral 8x7B Instruct', 'per_1m_output_tokens', 0.70,  'USD', 311, NULL),
  -- Mistral Large 3 (675B)
  ('bedrock', 'mistral.mistral-large-3-675b-instruct', 'Mistral Large 3',    'per_1m_input_tokens',  0.50,  'USD', 320, '675B параметрів'),
  ('bedrock', 'mistral.mistral-large-3-675b-instruct', 'Mistral Large 3',    'per_1m_output_tokens', 1.50,  'USD', 321, NULL),
  -- Devstral 2 123B
  ('bedrock', 'mistral.devstral-2-123b',             'Devstral 2 123B',      'per_1m_input_tokens',  0.40,  'USD', 330, 'Код-орієнтована модель'),
  ('bedrock', 'mistral.devstral-2-123b',             'Devstral 2 123B',      'per_1m_output_tokens', 2.00,  'USD', 331, NULL),
  -- Magistral Small
  ('bedrock', 'mistral.magistral-small-2509',        'Magistral Small',      'per_1m_input_tokens',  0.50,  'USD', 340, 'Reasoning модель'),
  ('bedrock', 'mistral.magistral-small-2509',        'Magistral Small',      'per_1m_output_tokens', 1.50,  'USD', 341, NULL)
ON CONFLICT (provider, model, unit_type) DO NOTHING;

-- ── DeepSeek on Bedrock ─────────────────────────────────────────────────────

INSERT INTO service_pricing (provider, model, display_name, unit_type, price_usd, currency, sort_order, notes) VALUES
  -- DeepSeek R1
  ('bedrock', 'deepseek.r1-v1:0',  'DeepSeek R1',   'per_1m_input_tokens',  1.35,  'USD', 400, 'Reasoning модель'),
  ('bedrock', 'deepseek.r1-v1:0',  'DeepSeek R1',   'per_1m_output_tokens', 5.40,  'USD', 401, NULL),
  -- DeepSeek V3.2
  ('bedrock', 'deepseek.v3.2',     'DeepSeek V3.2', 'per_1m_input_tokens',  0.62,  'USD', 410, NULL),
  ('bedrock', 'deepseek.v3.2',     'DeepSeek V3.2', 'per_1m_output_tokens', 1.85,  'USD', 411, NULL)
ON CONFLICT (provider, model, unit_type) DO NOTHING;

-- ── Cohere on Bedrock ───────────────────────────────────────────────────────

INSERT INTO service_pricing (provider, model, display_name, unit_type, price_usd, currency, sort_order, notes) VALUES
  -- Command R
  ('bedrock', 'cohere.command-r-v1:0',      'Cohere Command R',    'per_1m_input_tokens',  0.50,  'USD', 500, NULL),
  ('bedrock', 'cohere.command-r-v1:0',      'Cohere Command R',    'per_1m_output_tokens', 1.50,  'USD', 501, NULL),
  -- Command R+
  ('bedrock', 'cohere.command-r-plus-v1:0', 'Cohere Command R+',   'per_1m_input_tokens',  2.50,  'USD', 510, NULL),
  ('bedrock', 'cohere.command-r-plus-v1:0', 'Cohere Command R+',   'per_1m_output_tokens', 10.00, 'USD', 511, NULL),
  -- Embed Multilingual
  ('bedrock', 'cohere.embed-multilingual-v3', 'Cohere Embed Multilingual v3', 'per_1m_tokens', 0.10, 'USD', 520, 'Multilingual ембедінг, 512 dim'),
  -- Embed English
  ('bedrock', 'cohere.embed-english-v3',    'Cohere Embed English v3',  'per_1m_tokens',    0.10,  'USD', 530, NULL),
  -- Embed v4
  ('bedrock', 'cohere.embed-v4:0',          'Cohere Embed v4',         'per_1m_tokens',     0.10,  'USD', 540, 'Мультимодальний ембедінг')
ON CONFLICT (provider, model, unit_type) DO NOTHING;

-- ── Amazon Titan Embeddings ─────────────────────────────────────────────────

INSERT INTO service_pricing (provider, model, display_name, unit_type, price_usd, currency, sort_order, notes) VALUES
  ('bedrock', 'amazon.titan-embed-text-v1',  'Titan Embeddings G1 Text', 'per_1m_tokens', 0.10, 'USD', 600, '1536 dim'),
  ('bedrock', 'amazon.titan-embed-text-v2:0', 'Titan Embeddings G2 Text', 'per_1m_tokens', 0.02, 'USD', 610, '1024 dim, налаштовуваний'),
  ('bedrock', 'amazon.titan-embed-image-v1',  'Titan Multimodal Embeddings', 'per_1m_tokens', 0.80, 'USD', 620, 'Текст + зображення')
ON CONFLICT (provider, model, unit_type) DO NOTHING;

-- ── Qwen on Bedrock ─────────────────────────────────────────────────────────

INSERT INTO service_pricing (provider, model, display_name, unit_type, price_usd, currency, sort_order, notes) VALUES
  ('bedrock', 'qwen.qwen3-32b-v1:0',          'Qwen3 32B',              'per_1m_input_tokens',  0.15,  'USD', 700, NULL),
  ('bedrock', 'qwen.qwen3-32b-v1:0',          'Qwen3 32B',              'per_1m_output_tokens', 0.60,  'USD', 701, NULL),
  ('bedrock', 'qwen.qwen3-coder-30b-a3b-v1:0','Qwen3 Coder 30B',       'per_1m_input_tokens',  0.15,  'USD', 710, 'Код-орієнтована'),
  ('bedrock', 'qwen.qwen3-coder-30b-a3b-v1:0','Qwen3 Coder 30B',       'per_1m_output_tokens', 0.60,  'USD', 711, NULL)
ON CONFLICT (provider, model, unit_type) DO NOTHING;

-- ── Google Gemma on Bedrock ─────────────────────────────────────────────────

INSERT INTO service_pricing (provider, model, display_name, unit_type, price_usd, currency, sort_order, notes) VALUES
  ('bedrock', 'google.gemma-3-4b-it',  'Gemma 3 4B',  'per_1m_input_tokens',  0.04,  'USD', 800, NULL),
  ('bedrock', 'google.gemma-3-4b-it',  'Gemma 3 4B',  'per_1m_output_tokens', 0.08,  'USD', 801, NULL),
  ('bedrock', 'google.gemma-3-12b-it', 'Gemma 3 12B', 'per_1m_input_tokens',  0.09,  'USD', 810, NULL),
  ('bedrock', 'google.gemma-3-12b-it', 'Gemma 3 12B', 'per_1m_output_tokens', 0.29,  'USD', 811, NULL),
  ('bedrock', 'google.gemma-3-27b-it', 'Gemma 3 27B', 'per_1m_input_tokens',  0.23,  'USD', 820, NULL),
  ('bedrock', 'google.gemma-3-27b-it', 'Gemma 3 27B', 'per_1m_output_tokens', 0.38,  'USD', 821, NULL)
ON CONFLICT (provider, model, unit_type) DO NOTHING;

-- ── Other providers on Bedrock ──────────────────────────────────────────────

INSERT INTO service_pricing (provider, model, display_name, unit_type, price_usd, currency, sort_order, notes) VALUES
  -- AI21 Jamba
  ('bedrock', 'ai21.jamba-1-5-large-v1:0', 'AI21 Jamba 1.5 Large', 'per_1m_input_tokens',  2.00,  'USD', 900, '256K контекст'),
  ('bedrock', 'ai21.jamba-1-5-large-v1:0', 'AI21 Jamba 1.5 Large', 'per_1m_output_tokens', 8.00,  'USD', 901, NULL),
  ('bedrock', 'ai21.jamba-1-5-mini-v1:0',  'AI21 Jamba 1.5 Mini',  'per_1m_input_tokens',  0.20,  'USD', 910, '256K контекст'),
  ('bedrock', 'ai21.jamba-1-5-mini-v1:0',  'AI21 Jamba 1.5 Mini',  'per_1m_output_tokens', 0.40,  'USD', 911, NULL),
  -- MiniMax M2.1
  ('bedrock', 'minimax.minimax-m2.1',       'MiniMax M2.1',         'per_1m_input_tokens',  0.30,  'USD', 920, NULL),
  ('bedrock', 'minimax.minimax-m2.1',       'MiniMax M2.1',         'per_1m_output_tokens', 1.20,  'USD', 921, NULL)
ON CONFLICT (provider, model, unit_type) DO NOTHING;
