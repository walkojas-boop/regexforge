/**
 * Battle-tested template bank. Each entry is a (name, regex, flags, keywords) tuple.
 * At synth time we test every template against the caller's examples and pick
 * the best one that passes all of them. NL description tokens match against
 * keywords to break ties.
 */
export type Template = {
  name: string;
  pattern: string;
  flags: string;
  keywords: string[];
};

export const TEMPLATES: Template[] = [
  // digits / numbers
  { name: 'positive_integer', pattern: '^\\d+$', flags: '', keywords: ['integer', 'number', 'digit', 'positive', 'int'] },
  { name: 'signed_integer', pattern: '^-?\\d+$', flags: '', keywords: ['integer', 'signed', 'negative', 'int'] },
  { name: 'decimal_number', pattern: '^-?\\d+(?:\\.\\d+)?$', flags: '', keywords: ['decimal', 'float', 'number'] },
  { name: 'scientific_number', pattern: '^-?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?$', flags: '', keywords: ['scientific', 'exponent'] },
  { name: 'percent', pattern: '^\\d+(?:\\.\\d+)?%$', flags: '', keywords: ['percent', 'percentage'] },
  { name: 'us_currency', pattern: '^\\$\\d{1,3}(?:,\\d{3})*(?:\\.\\d{2})?$', flags: '', keywords: ['dollar', 'currency', 'usd', 'price', 'money'] },
  { name: 'unix_timestamp_s', pattern: '^\\d{10}$', flags: '', keywords: ['timestamp', 'unix', 'epoch', 'seconds'] },
  { name: 'unix_timestamp_ms', pattern: '^\\d{13}$', flags: '', keywords: ['timestamp', 'milliseconds', 'ms', 'javascript'] },
  { name: 'port_number', pattern: '^(?:[0-9]{1,4}|[1-5][0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-5])$', flags: '', keywords: ['port', 'tcp', 'udp'] },

  // letters
  { name: 'lowercase_letters', pattern: '^[a-z]+$', flags: '', keywords: ['lowercase', 'lower', 'letters', 'alpha'] },
  { name: 'uppercase_letters', pattern: '^[A-Z]+$', flags: '', keywords: ['uppercase', 'upper', 'letters', 'alpha', 'caps'] },
  { name: 'mixed_letters', pattern: '^[a-zA-Z]+$', flags: '', keywords: ['letters', 'alpha', 'alphabetic'] },
  { name: 'alphanumeric', pattern: '^[a-zA-Z0-9]+$', flags: '', keywords: ['alphanumeric', 'alnum'] },
  { name: 'alphanumeric_underscore', pattern: '^\\w+$', flags: '', keywords: ['word', 'identifier', 'alphanumeric', 'underscore'] },
  { name: 'slug', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$', flags: '', keywords: ['slug', 'url-safe', 'kebab'] },
  { name: 'snake_case', pattern: '^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$', flags: '', keywords: ['snake', 'snake_case', 'identifier'] },
  { name: 'camel_case', pattern: '^[a-z][a-zA-Z0-9]*$', flags: '', keywords: ['camel', 'camelcase', 'identifier'] },
  { name: 'pascal_case', pattern: '^[A-Z][a-zA-Z0-9]*$', flags: '', keywords: ['pascal', 'pascalcase', 'class'] },

  // email / url / hostnames
  { name: 'email_rfc_lite', pattern: '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$', flags: '', keywords: ['email', 'mail', '@'] },
  { name: 'http_url', pattern: '^https?:\\/\\/[A-Za-z0-9.-]+(?::\\d+)?(?:\\/[^\\s]*)?$', flags: '', keywords: ['url', 'http', 'https', 'link'] },
  { name: 'https_only_url', pattern: '^https:\\/\\/[A-Za-z0-9.-]+(?::\\d+)?(?:\\/[^\\s]*)?$', flags: '', keywords: ['url', 'https', 'secure'] },
  { name: 'hostname', pattern: '^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$', flags: '', keywords: ['hostname', 'domain', 'fqdn'] },

  // identifiers
  { name: 'uuid_any', pattern: '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$', flags: '', keywords: ['uuid', 'guid', 'id'] },
  { name: 'uuid_v4', pattern: '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-4[a-fA-F0-9]{3}-[89abAB][a-fA-F0-9]{3}-[a-fA-F0-9]{12}$', flags: '', keywords: ['uuid', 'v4', 'guid'] },
  { name: 'sha256_hex', pattern: '^[a-f0-9]{64}$', flags: '', keywords: ['sha256', 'hash', 'digest', 'hex'] },
  { name: 'sha1_hex', pattern: '^[a-f0-9]{40}$', flags: '', keywords: ['sha1', 'hash', 'git'] },
  { name: 'md5_hex', pattern: '^[a-f0-9]{32}$', flags: '', keywords: ['md5', 'hash'] },
  { name: 'hex_color_6', pattern: '^#[0-9a-fA-F]{6}$', flags: '', keywords: ['color', 'hex', 'rgb', '#'] },
  { name: 'hex_color_3_or_6', pattern: '^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$', flags: '', keywords: ['color', 'hex'] },
  { name: 'ethereum_address', pattern: '^0x[a-fA-F0-9]{40}$', flags: '', keywords: ['ethereum', 'eth', 'wallet', 'evm', 'address', 'base'] },
  { name: 'tx_hash_32byte', pattern: '^0x[a-fA-F0-9]{64}$', flags: '', keywords: ['tx', 'transaction', 'hash'] },

  // dates / times (ISO-ish)
  { name: 'iso_date', pattern: '^\\d{4}-\\d{2}-\\d{2}$', flags: '', keywords: ['date', 'iso', 'yyyy-mm-dd'] },
  { name: 'iso_time', pattern: '^\\d{2}:\\d{2}(?::\\d{2})?$', flags: '', keywords: ['time', 'clock', 'hh:mm'] },
  { name: 'iso_datetime', pattern: '^\\d{4}-\\d{2}-\\d{2}[Tt ]\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:?\\d{2})?$', flags: '', keywords: ['datetime', 'iso', 'timestamp', 'iso8601'] },
  { name: 'us_date_slash', pattern: '^\\d{1,2}/\\d{1,2}/\\d{2,4}$', flags: '', keywords: ['date', 'us', 'mm/dd'] },

  // networking
  { name: 'ipv4', pattern: '^(?:(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\.){3}(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)$', flags: '', keywords: ['ip', 'ipv4', 'address'] },
  { name: 'ipv4_loose', pattern: '^\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}$', flags: '', keywords: ['ip', 'ipv4'] },
  { name: 'mac_address_colon', pattern: '^(?:[0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$', flags: '', keywords: ['mac', 'ether', 'network'] },
  { name: 'mac_address_dash', pattern: '^(?:[0-9A-Fa-f]{2}-){5}[0-9A-Fa-f]{2}$', flags: '', keywords: ['mac', 'dash'] },

  // phone
  { name: 'phone_us_flexible', pattern: '^(?:\\+?1[-.\\s]?)?\\(?[2-9]\\d{2}\\)?[-.\\s]?\\d{3}[-.\\s]?\\d{4}$', flags: '', keywords: ['phone', 'us', 'tel'] },
  { name: 'phone_e164', pattern: '^\\+[1-9]\\d{1,14}$', flags: '', keywords: ['phone', 'e164', 'international'] },

  // postal
  { name: 'us_zip', pattern: '^\\d{5}(?:-\\d{4})?$', flags: '', keywords: ['zip', 'zipcode', 'postal', 'us'] },
  { name: 'uk_postcode', pattern: '^[A-Z]{1,2}\\d[A-Z\\d]?\\s*\\d[A-Z]{2}$', flags: 'i', keywords: ['postcode', 'uk', 'british'] },
  { name: 'canada_postal', pattern: '^[A-Z]\\d[A-Z]\\s?\\d[A-Z]\\d$', flags: 'i', keywords: ['postal', 'canada'] },

  // code / dev
  { name: 'semver', pattern: '^\\d+\\.\\d+\\.\\d+(?:-[\\w.-]+)?(?:\\+[\\w.-]+)?$', flags: '', keywords: ['semver', 'version'] },
  { name: 'semver_partial', pattern: '^v?\\d+\\.\\d+(?:\\.\\d+)?$', flags: '', keywords: ['version', 'semver'] },
  { name: 'filepath_unix', pattern: '^(?:/[^/\\0\\s]+)+/?$', flags: '', keywords: ['path', 'unix', 'linux'] },
  { name: 'filename_with_ext', pattern: '^[^/\\0\\s]+\\.[A-Za-z0-9]{1,10}$', flags: '', keywords: ['file', 'filename', 'extension'] },

  // social / accounts
  { name: 'twitter_handle', pattern: '^@?[A-Za-z0-9_]{1,15}$', flags: '', keywords: ['twitter', 'handle', 'x', 'username'] },
  { name: 'github_username', pattern: '^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38}[A-Za-z0-9])?$', flags: '', keywords: ['github', 'username'] },
  { name: 'youtube_id', pattern: '^[A-Za-z0-9_-]{11}$', flags: '', keywords: ['youtube', 'video', 'id'] },

  // cards / ids
  { name: 'visa_card', pattern: '^4\\d{12}(?:\\d{3})?$', flags: '', keywords: ['visa', 'credit', 'card'] },
  { name: 'mastercard', pattern: '^5[1-5]\\d{14}$', flags: '', keywords: ['mastercard', 'credit', 'card'] },
  { name: 'amex_card', pattern: '^3[47]\\d{13}$', flags: '', keywords: ['amex', 'american', 'express', 'card'] },
  { name: 'isbn_10', pattern: '^(?:\\d{9})[\\dX]$', flags: '', keywords: ['isbn', 'book', '10'] },
  { name: 'isbn_13', pattern: '^97[89]\\d{10}$', flags: '', keywords: ['isbn', 'book', '13'] },

  // booleans
  { name: 'boolean_truthy_strict', pattern: '^(?:true|false)$', flags: '', keywords: ['boolean', 'bool', 'truefalse'] },
  { name: 'boolean_truthy_loose', pattern: '^(?:true|false|yes|no|1|0|on|off)$', flags: 'i', keywords: ['boolean', 'bool'] },

  // base64
  { name: 'base64', pattern: '^[A-Za-z0-9+/]+={0,2}$', flags: '', keywords: ['base64', 'encoded'] },
  { name: 'base64_url', pattern: '^[A-Za-z0-9_-]+={0,2}$', flags: '', keywords: ['base64url', 'base64'] },

  // misc
  { name: 'hex_any_length', pattern: '^[0-9a-fA-F]+$', flags: '', keywords: ['hex', 'hexadecimal'] },
  { name: 'binary_string', pattern: '^[01]+$', flags: '', keywords: ['binary', 'bits'] },
  { name: 'whitespace', pattern: '^\\s+$', flags: '', keywords: ['whitespace', 'blank', 'space'] },
  { name: 'not_empty', pattern: '^.+$', flags: '', keywords: ['nonempty', 'any'] },
];
