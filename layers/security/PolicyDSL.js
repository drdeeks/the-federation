// Adapted from prior (disclosed, pre-existing) infrastructure work — see README.md provenance/disclosure section.
// Policy DSL — parser and evaluator for a small rule-based policy definition language.

export class PolicyDSL {
  /**
   * Parse a policy definition string into structured rules.
   * @param {string} policyString - The policy text to parse.
   * @returns {{ valid: boolean, rules: Array<{id: string, content: string, threshold?: number, sensor_type?: string}> }}
   */
  static parse(policyString) {
    if (!policyString || typeof policyString !== 'string') {
      throw new Error('Invalid policy string');
    }

    const rules = [];
    // Match rule blocks: rule <id> { ... }
    const ruleRegex = /rule\s+(\w+)\s*\{([^}]*)\}/g;
    let match;

    while ((match = ruleRegex.exec(policyString)) !== null) {
      const ruleId = match[1];
      const body = match[2].trim();

      if (body.length === 0) continue;

      const rule = {
        id: ruleId,
        content: body,
      };

      // Extract key-value pairs from the rule body
      const kvRegex = /(\w+)\s*:\s*(?:"([^"]*)"|([^\s}]+))/g;
      let kvMatch;
      while ((kvMatch = kvRegex.exec(body)) !== null) {
        const key = kvMatch[1];
        const strVal = kvMatch[2];
        const numVal = kvMatch[3];
        const value = strVal !== undefined ? strVal : parseFloat(numVal);
        rule[key] = value;
      }

      rules.push(rule);
    }

    return {
      valid: rules.length > 0,
      rules,
    };
  }

  /**
   * Evaluate a parsed policy against sensor data.
   * Returns true if any rule is triggered (threshold exceeded).
   * @param {object} parsedPolicy - Result from PolicyDSL.parse()
   * @param {object} data - Sensor data with sensor_type and value.
   * @returns {boolean}
   */
  static evaluate(parsedPolicy, data) {
    if (!parsedPolicy || !data) {
      return false;
    }

    for (const rule of parsedPolicy.rules) {
      // Check sensor type match
      if (rule.sensor_type && rule.sensor_type !== data.sensor_type) {
        continue;
      }

      // Check threshold
      if (rule.threshold !== undefined && data.value !== undefined) {
        if (data.value > rule.threshold) {
          return true;
        }
      }
    }

    return false;
  }
}
