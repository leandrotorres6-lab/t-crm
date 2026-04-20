// URL do backend — usa variável de ambiente em produção, localhost em desenvolvimento
export const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'
export const API_URL = `${BACKEND_URL}/api`
