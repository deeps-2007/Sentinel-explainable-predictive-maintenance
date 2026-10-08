/** Convert a MySQL machine_readings row into the feature dict shape the ML service expects. */
export function readingToFeatureDict(reading) {
  return {
    Type: reading.machine_type,
    "Air temperature [K]": reading.air_temperature,
    "Process temperature [K]": reading.process_temperature,
    "Rotational speed [rpm]": reading.rotational_speed,
    "Torque [Nm]": reading.torque,
    "Tool wear [min]": reading.tool_wear,
  };
}
