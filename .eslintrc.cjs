{
  "root": true,
  "parser": "@typescript-eslint/parser",
  "plugins": ["@typescript-eslint"],
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended"
  ],
  "rules": {
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
    "no-restricted-imports": [
      "error",
      {
        "patterns": [
          {
            "group": ["../**"],
            "message": "Cross-service imports are not allowed. Services must communicate via API."
          }
        ]
      }
    ]
  },
  "overrides": [
    {
      "files": ["packages/*"],
      "rules": {
        "no-restricted-imports": [
          "error",
          {
            "patterns": [
              {
                "group": ["../**"],
                "message": "Cannot import from other packages/workspaces"
              },
              {
                "group": ["../../agents/**"],
                "message": "Cannot import from agents workspace"
              },
              {
                "group": ["../../services/**"],
                "message": "Cannot import from services workspace"
              }
            ]
          }
        ]
      }
    },
    {
      "files": ["workers/*"],
      "rules": {
        "no-restricted-imports": [
          "error",
          {
            "patterns": [
              {
                "group": ["../**"],
                "message": "Cannot import from other workers/workspaces"
              },
              {
                "group": ["../../agents/**"],
                "message": "Cannot import from agents workspace"
              },
              {
                "group": ["../../services/**"],
                "message": "Cannot import from services workspace"
              }
            ]
          }
        ]
      }
    },
    {
      "files": ["agents/*"],
      "rules": {
        "no-restricted-imports": [
          "error",
          {
            "patterns": [
              {
                "group": ["../**"],
                "message": "Cannot import from other agents/workspaces"
              },
              {
                "group": ["../../packages/**"],
                "message": "Cannot import from packages workspace"
              },
              {
                "group": ["../../services/**"],
                "message": "Cannot import from services workspace"
              },
              {
                "group": ["../../workers/**"],
                "message": "Cannot import from workers workspace"
              }
            ]
          }
        ]
      }
    },
    {
      "files": ["services/*"],
      "rules": {
        "no-restricted-imports": [
          "error",
          {
            "patterns": [
              {
                "group": ["../**"],
                "message": "Cannot import from other services/workspaces"
              },
              {
                "group": ["../../agents/**"],
                "message": "Cannot import from agents workspace"
              },
              {
                "group": ["../../workers/**"],
                "message": "Cannot import from workers workspace"
              }
            ]
          }
        ]
      }
    }
  ]
}