-- Run after 001-baseline.sql in the NEW database. Region codes must be signed off before seeding.
BEGIN;
CREATE TABLE mdm.region_sequence (
  region_code char(2) PRIMARY KEY CHECK(region_code ~ '^[0-9]{2}$'),
  last_value bigint NOT NULL DEFAULT 0 CHECK(last_value BETWEEN 0 AND 9999999999)
);

CREATE FUNCTION mdm.luhn_digit(payload text) RETURNS char(1)
LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE total integer := 0; digit integer; pos integer; distance integer;
BEGIN
  IF payload !~ '^[0-9]{12}$' THEN RAISE EXCEPTION 'Luhn payload must contain 12 digits'; END IF;
  FOR pos IN 1..12 LOOP
    digit := substring(payload FROM pos FOR 1)::integer;
    distance := 12-pos;
    IF distance % 2 = 0 THEN
      digit := digit*2;
      IF digit>9 THEN digit:=digit-9; END IF;
    END IF;
    total:=total+digit;
  END LOOP;
  RETURN ((10-total%10)%10)::text::char(1);
END $$;

CREATE FUNCTION mdm.valid_unified_code(code text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE STRICT AS $$
BEGIN
  IF code !~ '^ZZU[0-9]{13}$' THEN RETURN false; END IF;
  RETURN right(code,1)=mdm.luhn_digit(substring(code FROM 4 FOR 12));
END $$;

CREATE FUNCTION mdm.next_unified_code(region text) RETURNS char(16)
LANGUAGE plpgsql VOLATILE STRICT AS $$
DECLARE seq bigint; payload text;
BEGIN
  IF region !~ '^[0-9]{2}$' THEN RAISE EXCEPTION 'Region must contain 2 digits'; END IF;
  -- Row lock acquired by UPDATE serializes issuance only within the same region.
  UPDATE mdm.region_sequence SET last_value=last_value+1
    WHERE region_code=region AND last_value<9999999999 RETURNING last_value INTO seq;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown or exhausted region %',region; END IF;
  payload:=region||lpad(seq::text,10,'0');
  RETURN ('ZZU'||payload||mdm.luhn_digit(payload))::char(16);
END $$;

ALTER TABLE dwd.account ADD CONSTRAINT account_code_luhn CHECK(mdm.valid_unified_code(unified_code));
ALTER TABLE mdm.company ADD CONSTRAINT company_region_fk FOREIGN KEY(unified_prefix) REFERENCES mdm.region_sequence(region_code);
COMMIT;

-- Verification (read-only): should return true / false respectively.
SELECT mdm.valid_unified_code('ZZU0200000000014') AS valid_example,
       mdm.valid_unified_code('ZZU0200000000015') AS invalid_example;
-- Issuance must occur in the same transaction as account + entity_mapping creation.
-- Do not issue externally before commit; do not promise gapless sequences.
