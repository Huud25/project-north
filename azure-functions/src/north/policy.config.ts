export const POLICY_CONFIG = {
    policyVersion: "1.1.0",
  
    // Pesos somam 1.0 (modelo ponderado enterprise)
    weights: {
      environment: 0.25,
      action: 0.25,
      blastRadius: 0.2,
      irreversible: 0.15,
      governanceMissing: 0.15
    },
  
    // Severidade base por ambiente (0..100)
    environmentScores: {
      dev: 10,
      staging: 40,
      prod: 80
    },
  
    // Severidade base por ação (0..100)
    actionScores: {
      restart: 20,
      deploy: 50,
      delete: 80,
      drop: 90
    },
  
    // Blast radius: multiplicador simples (ex: blastRadius=7 -> 70)
    blastRadius: {
      multiplier: 10,
      maxScore: 100
    },
  
    // Penalidades (0..100)
    penalties: {
      irreversible: 70,
      governanceMissing: 60
    },
  
    // Thresholds do risk level (baseado no score final 0..100)
    thresholds: {
      LOW: 0,
      MEDIUM: 30,
      HIGH: 60,
      CRITICAL: 80
    }
  } as const;