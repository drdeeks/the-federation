// Adapted from prior (disclosed, pre-existing) infrastructure work — see README.md provenance/disclosure section.
// Burst Policy Engine — evaluates burst/rate-based detection rules against
// incoming sensor (or event) streams in real time.

// --- SensorReadingObj ---

export class SensorReadingObj {
  constructor({ sensorId, sensorType, value, timestamp }) {
    this.sensorId = sensorId;
    this.sensorType = sensorType;
    this.value = value;
    this.timestamp = timestamp;
  }
}

// --- BurstPolicyEngine (static utility class) ---

export class BurstPolicyEngine {
  /**
   * Detect if a burst has occurred in the sensor data.
   * @param {number[]} sensorData - Array of sensor values.
   * @param {number} threshold - Value threshold.
   * @param {number} window_seconds - Time window (unused in static analysis, kept for API).
   * @param {number} min_occurrences - Minimum number of threshold exceedances to count as burst.
   * @returns {boolean}
   */
  static detectBurst(sensorData, threshold, window_seconds, min_occurrences) {
    if (!Array.isArray(sensorData)) {
      throw new Error('sensorData must be an array');
    }
    if (sensorData.length === 0) {
      return false;
    }

    let count = 0;
    for (const val of sensorData) {
      if (val > threshold) {
        count++;
      }
    }
    return count >= min_occurrences;
  }

  /**
   * Validate a burst detection rule.
   * @param {object} rule - Rule object to validate.
   * @returns {{ valid: boolean, error?: string }}
   */
  static validateRule(rule) {
    if (rule === null || rule === undefined || typeof rule !== 'object' || Array.isArray(rule)) {
      return { valid: false, error: 'Rule must be an object' };
    }

    const requiredFields = ['rule_id', 'sensor_type', 'threshold', 'window_seconds', 'min_occurrences'];
    const missing = requiredFields.filter(f => !(f in rule));
    if (missing.length > 0) {
      return { valid: false, error: `Missing required fields: ${missing.join(', ')}` };
    }

    // Validate numeric fields are positive
    const numericFields = ['threshold', 'window_seconds', 'min_occurrences'];
    const invalidFields = numericFields.filter(f => typeof rule[f] !== 'number' || rule[f] <= 0);
    if (invalidFields.length > 0) {
      return { valid: false, error: `Fields must be positive numbers: ${invalidFields.join(', ')}` };
    }

    return { valid: true };
  }
}

// --- SensorBurstEngine (instance-based engine) ---

let _alertCounter = 0;

export class SensorBurstEngine {
  /**
   * Create with defaults: 100 alerts/min, 60000ms cooldown.
   */
  static withDefaults() {
    return new SensorBurstEngine(100, 60000);
  }

  /**
   * @param {number} maxAlertsPerMinute - Max alerts before rate limiting.
   * @param {number} cooldownMs - Cooldown period for deduplication.
   */
  constructor(maxAlertsPerMinute = 100, cooldownMs = 60000) {
    this._rules = [];
    this._sensors = new Set();
    this._alerts = [];
    this._events = [];
    this._lastAlertTime = new Map(); // key: "sensorId:ruleId" -> timestamp
    this._maxAlertsPerMinute = maxAlertsPerMinute;
    this._cooldownMs = cooldownMs;
    this._alertCountThisMinute = 0;
    this._minuteStart = Date.now();
  }

  get ruleCount() {
    return this._rules.length;
  }

  get sensorCount() {
    return this._sensors.size;
  }

  get alerts() {
    return this._alerts;
  }

  get events() {
    return this._events;
  }

  /**
   * Add a burst detection rule.
   */
  addRule({ ruleId, sensor_type, threshold, windowSeconds, minOccurrences, severity, safetyThreshold }) {
    this._rules.push({
      ruleId,
      sensor_type,
      threshold,
      windowSeconds,
      minOccurrences,
      severity,
      safetyThreshold,
    });
  }

  /**
   * Process a sensor reading and return any triggered events.
   */
  processReading(reading) {
    // Reset minute counter if a minute has passed
    const now = reading.timestamp;
    if (now - this._minuteStart >= 60000) {
      this._alertCountThisMinute = 0;
      this._minuteStart = now;
    }

    const events = [];

    // Track this sensor
    this._sensors.add(reading.sensorId);

    // Check each applicable rule
    for (const rule of this._rules) {
      if (rule.sensor_type !== reading.sensorType) {
        continue;
      }

      if (reading.value <= rule.threshold) {
        continue;
      }

      // Value exceeds threshold — count occurrences for this sensor+rule
      const key = `${reading.sensorId}:${rule.ruleId}`;
      const history = this._lastAlertTime.get(key) || { count: 0, lastTime: 0 };

      // Check if within window
      const inWindow = (now - history.lastTime) <= rule.windowSeconds * 1000;
      const currentCount = inWindow ? history.count + 1 : 1;

      if (currentCount < rule.minOccurrences) {
        // Not enough occurrences yet, but track it
        this._lastAlertTime.set(key, { count: currentCount, lastTime: now });
        continue;
      }

      // Determine if this is a duplicate (within cooldown)
      const isDuplicate = (now - history.lastTime) < this._cooldownMs && history.count >= rule.minOccurrences;

      // Determine if rate-limited
      const isRateLimited = this._alertCountThisMinute >= this._maxAlertsPerMinute;

      // Classify severity
      let alertSeverity = rule.severity || 'INFO';
      if (rule.safetyThreshold !== null && rule.safetyThreshold !== undefined) {
        const ratio = reading.value / rule.threshold;
        if (reading.value >= rule.safetyThreshold) {
          alertSeverity = 'CRITICAL';
        } else if (ratio > 1.5) {
          alertSeverity = 'WARNING';
        } else if (alertSeverity === 'WARNING' || alertSeverity === 'CRITICAL') {
          // Keep as is or downgrade to INFO for values just above threshold
          if (ratio <= 1.2) {
            alertSeverity = 'INFO';
          }
        }
      }

      // Generate unique alert ID
      _alertCounter++;
      const alertId = `alert-${_alertCounter}`;

      const event = {
        alert: {
          alert_id: alertId,
          rule_id: rule.ruleId,
          sensor_id: reading.sensorId,
          severity: alertSeverity,
          value: reading.value,
          threshold: rule.threshold,
          occurrences: currentCount,
          timestamp: now,
        },
        is_duplicate: isDuplicate,
        is_rate_limited: isRateLimited,
      };

      events.push(event);
      this._events.push(event);

      // Only store non-duplicate, non-rate-limited alerts
      if (!isDuplicate && !isRateLimited) {
        this._alerts.push(event.alert);
        this._alertCountThisMinute++;
      }

      // Update history
      this._lastAlertTime.set(key, { count: currentCount, lastTime: now });
    }

    return events;
  }
}
