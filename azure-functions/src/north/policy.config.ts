export const POLICY_CONFIG = {
    policyVersion: "1.2.0",
  
    strictProduction: true, // 🔒 novo modo strict configurável
  
    weights: {
      environment: 0.25,
      action: 0.25,
      blastRadius: 0.2,
      irreversible: 0.15,
      governanceMissing: 0.15
    },
  
    environmentScores: {
      dev: 10,
      staging: 40,
      prod: 80
    },
  
    actionScores: {
      restart: 20,
      deploy: 50,
      delete: 80,
      drop: 90
    },
  
    blastRadius: {
      multiplier: 10,
      maxScore: 100
    },
  
    penalties: {
      irreversible: 70,
      governanceMissing: 60
    },
  
    thresholds: {
      LOW: 0,
      MEDIUM: 30,
      HIGH: 60,
      CRITICAL: 80
    }
  } as const;