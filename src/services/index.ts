import axios from 'axios'
import { Record, Metric } from '@/types'
import useEvalutationStore from '@/stores/evaluation'

const BASE_URL = import.meta.env.VITE_API_URL || 'https://medical-backend-1056714537361.us-central1.run.app'

const instance = axios.create({
  baseURL: BASE_URL.endsWith('/') ? BASE_URL : `${BASE_URL}/`,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  }
})

// Add response interceptor for better error handling
instance.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error.response?.data || error.message)
    throw error
  }
)

// Cache for metrics and models data
let metricsCache = null;
let modelsCache = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
let lastMetricsFetch = 0;
let lastModelsFetch = 0;

// Function to get metrics with caching
async function getCachedMetrics() {
  const now = Date.now();
  if (metricsCache && (now - lastMetricsFetch) < CACHE_DURATION) {
    return metricsCache;
  }

  const response = await instance.get('metrics/');
  metricsCache = response.data;
  lastMetricsFetch = now;
  return metricsCache;
}

// Function to get models with caching
async function getCachedModels() {
  const now = Date.now();
  if (modelsCache && (now - lastModelsFetch) < CACHE_DURATION) {
    return modelsCache;
  }

  const response = await instance.get('models/');
  modelsCache = response.data;
  lastModelsFetch = now;
  return modelsCache;
}

// Function to test the API connectivity
async function testBackendConnection(): Promise<boolean> {
  try {
    await instance.get('models/');
    return true;
  } catch (error) {
    console.error('❌ Backend connection failed:', error);
    return false;
  }
}

interface ApiResponse<T> {
  data: T
  status: number
  message?: string
}

interface UserDetails {
  id: string
  name: string
  email: string
  role: string
}

interface EvaluationData {
  id: string
  case_assignment: string
  model_response: string
  metric: string
  score: number
  created_at: string
}

interface ModelResponse {
  id: string
  model: string
  name: string
  response: string
}

interface CaseAssignment {
  id: string
  case: string
  evaluator: string
}

// Get user details and role
async function getUserDetails(userId: string): Promise<UserDetails> {
  try {
    const response = await instance.get(`users/${userId}/`);
    return response.data;
  } catch (error) {
    console.error('Error fetching user details:', error);
    throw error;
  }
}

// Check if a user is a supervisor
async function isSupervisor(userId: string): Promise<boolean> {
  try {
    const user = await getUserDetails(userId);
    return user.role === 'supervisor';
  } catch (error) {
    console.error('Error checking if user is supervisor:', error);
    return false;
  }
}

// Get all users/evaluators (for supervisors)
async function getAllEvaluators(): Promise<any[]> {
  try {
    // Only get users with role=evaluator
    const response = await instance.get('users/?role=evaluator');
    return response.data;
  } catch (error) {
    console.error('Error fetching evaluators:', error);
    throw error;
  }
}

// Get all evaluations (for supervisors) with optional filtering
async function getAllEvaluations(evaluatorId?: string, raw = true): Promise<EvaluationData[]> {
  try {
    const response = await instance.get(`evaluations/${evaluatorId ? `?evaluator=${evaluatorId}` : ''}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching evaluations:', error);
    throw error;
  }
}

// Get all cases with details (for supervisors)
async function getAllCases(): Promise<any[]> {
  try {
    const response = await instance.get('cases/');
    return response.data;
  } catch (error) {
    console.error('Error fetching cases:', error);
    throw error;
  }
}

// New function to get all cases assigned to a specific evaluator (doctor)
async function getEvaluatorCases(evaluatorId: string): Promise<any[]> {
  try {
    const response = await instance.get(`users/${evaluatorId}/cases/`);
    return response.data;
  } catch (error) {
    console.error('Error fetching evaluator cases:', error);
    throw error;
  }
}

// Types for evaluator cases response
interface CaseWithDetails {
  id: string;
  image_id: string;
  image_url: string;
  status: string;
  completed_evaluations: number;
  total_evaluations: number;
  last_updated: string;
}

interface CasesResponse {
  cases: CaseWithDetails[];
  total_cases: number;
  pending_cases: number;
  in_progress_cases: number;
  completed_cases: number;
}

// New optimized function to get all cases assigned to a specific evaluator with full details
async function getEvaluatorCasesWithDetails(evaluatorId: string): Promise<CasesResponse> {
  try {
    const response = await instance.get(`users/${evaluatorId}/cases_with_details/`);
    const casesData = response.data;
    
    if (casesData.cases && Array.isArray(casesData.cases)) {
      return casesData as CasesResponse;
    }

    return {
      cases: (casesData.cases || []).map((caseItem: any) => ({
        id: caseItem.id,
        image_id: caseItem.image_id,
        image_url: caseItem.image_url,
        status: caseItem.status || 'pending',
        completed_evaluations: caseItem.completed_evaluations || 0,
        total_evaluations: caseItem.total_evaluations || 0,
        last_updated: caseItem.updated_at || caseItem.created_at
      })),
      total_cases: casesData.total_cases || 0,
      pending_cases: casesData.pending_cases || 0,
      in_progress_cases: casesData.in_progress_cases || 0,
      completed_cases: casesData.completed_cases || 0
    };
  } catch (error) {
    console.error('Error fetching evaluator cases:', error);
    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Response status:', error.response.status);
      if (error.response.status === 504) {
        throw new Error('Request timeout - the server took too long to respond. Please try again.');
      }
    }
    throw error;
  }
}

async function getRecords(id: string): Promise<{ data: Record[] }> {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const doctorId = urlParams.get('doctorId');
    const isCaseId = !doctorId || id !== doctorId;
    
    if (isCaseId) {
      const response = await instance.get(`cases/${id}/full_details/`, {
        params: {
          evaluator_id: doctorId
        }
      });

      const data = response.data;

      if (!data || !data.imageUrl) {
        console.error('Invalid case data structure:', data);
        throw new Error('Invalid case data structure received from server');
      }

      const recordData: Record = {
        id: data.id,
        imageUrl: data.imageUrl,
        image_id: data.imageId,
        status: data.status,
        modelOutputs: (data.modelOutputs || []).map((response: any) => ({
          responseId: response.responseId,
          response: response.response || '',
          evaluations: (response.evaluations || []).map((evaluation: any) => ({
            responseId: evaluation.responseId,
            metricId: evaluation.metricId,
            metricName: evaluation.metricName,
            score: evaluation.score || 0
          }))
        })),
        metrics: (data.metrics || []).map((metric: any) => ({
          id: metric.id,
          name: metric.name,
          description: metric.description
        })),
        evaluations: (data.evaluations || []).map((evaluation: any) => ({
          responseId: evaluation.responseId,
          metricId: evaluation.metricId,
          metricName: evaluation.metricName,
          score: evaluation.score || 0
        })),
        groundTruth: (() => {
          try {
            // If it's already an object with findings/impressions, use it directly
            if (typeof data.groundTruth === 'object' && data.groundTruth !== null) {
              return {
                findings: data.groundTruth.findings || '',
                impressions: data.groundTruth.impressions || data.groundTruth.impression || ''
              };
            }

            // If it's a string, try to parse as JSON first
            if (typeof data.groundTruth === 'string') {
              // Check if it looks like JSON
              if (data.groundTruth.trim().startsWith('{')) {
                const parsed = JSON.parse(data.groundTruth);
                return {
                  findings: parsed.findings || '',
                  impressions: parsed.impressions || parsed.impression || ''
                };
              } else {
                // If it's not JSON, treat it as plain text and put it in findings
                return {
                  findings: data.groundTruth || '',
                  impressions: ''
                };
              }
            }

            // Fallback to empty strings if no valid data
            return { findings: '', impressions: '' };
          } catch (err) {
            console.error('Error parsing ground truth:', err);
            // If JSON parsing fails, treat the entire string as findings
            return { 
              findings: typeof data.groundTruth === 'string' ? data.groundTruth : '',
              impressions: '' 
            };
          }
        })(),
        models: [],
        navigation: data.navigation || undefined
      };

      return { data: [recordData] };
    } else {
      const casesResponse = await instance.get(`users/${id}/cases/`);
      const casesData = casesResponse.data;
      
      const records: Record[] = casesData.map((caseItem: any) => {
        const recordData: Record = {
          id: caseItem.id,
          imageUrl: caseItem.image_url,
          image_id: caseItem.image_id,
          status: caseItem.status,
          modelOutputs: (caseItem.modelOutputs || []).map((response: any) => ({
            responseId: response.responseId,
            response: response.response || '',
            evaluations: (response.evaluations || []).map((evaluation: any) => ({
              responseId: evaluation.responseId,
              metricId: evaluation.metricId,
              metricName: evaluation.metricName,
              score: evaluation.score || 0
            }))
          })),
          metrics: (caseItem.metrics || []).map((metric: any) => ({
            id: metric.id,
            name: metric.name,
            description: metric.description
          })),
          evaluations: (caseItem.evaluations || []).map((evaluation: any) => ({
            responseId: evaluation.responseId,
            metricId: evaluation.metricId,
            metricName: evaluation.metricName,
            score: evaluation.score || 0
          })),
          groundTruth: (() => {
            try {
              // If it's already an object with findings/impressions, use it directly
              if (typeof caseItem.groundTruth === 'object' && caseItem.groundTruth !== null) {
                return {
                  findings: caseItem.groundTruth.findings || '',
                  impressions: caseItem.groundTruth.impressions || caseItem.groundTruth.impression || ''
                };
              }

              // If it's a string, try to parse as JSON first
              if (typeof caseItem.groundTruth === 'string') {
                // Check if it looks like JSON
                if (caseItem.groundTruth.trim().startsWith('{')) {
                  const parsed = JSON.parse(caseItem.groundTruth);
                  return {
                    findings: parsed.findings || '',
                    impressions: parsed.impressions || parsed.impression || ''
                  };
                } else {
                  // If it's not JSON, treat it as plain text and put it in findings
                  return {
                    findings: caseItem.groundTruth || '',
                    impressions: ''
                  };
                }
              }

              // Fallback to empty strings if no valid data
              return { findings: '', impressions: '' };
            } catch (err) {
              console.error('Error parsing ground truth:', err);
              // If JSON parsing fails, treat the entire string as findings
              return { 
                findings: typeof caseItem.groundTruth === 'string' ? caseItem.groundTruth : '',
                impressions: '' 
              };
            }
          })(),
          models: [],
          navigation: caseItem.navigation || undefined
        };
        
        return recordData;
      });
      
      return { data: records };
    }
  } catch (error) {
    console.error('Error fetching records:', error);
    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Response status:', error.response.status);
      if (error.response.status === 504) {
        throw new Error('Request timeout - the server took too long to respond. Please try again.');
      }
    }
    throw error;
  }
}

interface BatchSubmissionData {
  case_id: string;
  evaluations: {
    response_id: string;
    metrics: {
      metric_id: string;
      score: number;
    }[];
  }[];
}

// Function to update a single evaluation
async function updateSingleEvaluation(data: {
  caseId: string;
  responseId: string;
  metricId: string;
  evaluatorId: string;
  score: number;
}) {
  try {
    const response = await instance.post('cases/evaluations/update/', data);
    return response.data;
  } catch (error) {
    console.error('Error updating evaluation:', error);
    throw error;
  }
}

// Function to get existing evaluations for a case
async function getExistingEvaluations(caseId: string) {
  try {
    const response = await instance.get(`cases/${caseId}/evaluations`);
    return response.data;
  } catch (error) {
    console.error('Error fetching evaluations:', error);
    return [];
  }
}

// Update the setRecords function to use the correct endpoint
async function setRecords(submissionData: {
  caseId: string;
  responseId: string;
  metricId: string;
  evaluatorId: string;
  score: number;
}) {
  try {
    const response = await instance.post('cases/evaluations/update/', submissionData);
    
    if (response.data.status === 'in_progress' || response.data.status === 'completed') {
      return { 
        success: true, 
        partial: response.data.status === 'in_progress',
        progress: response.data.progress
      };
    }
    
    return {
      success: false,
      partial: true,
      message: response.data.message || "Failed to submit evaluation",
      errors: []
    };
  } catch (error) {
    console.error('Error setting records:', error);
    throw error;
  }
}

// Get all metrics defined in the system
async function getMetrics(): Promise<any[]> {
  try {
    const response = await instance.get('metrics/');
    
    if (!response.data || !Array.isArray(response.data) || response.data.length === 0) {
      console.warn('Metrics API returned empty or invalid data, providing fallback metrics');
      return [
        { id: '1', name: 'Accuracy' },
        { id: '2', name: 'Completeness' },
        { id: '3', name: 'Relevance' }
      ];
    }
    
    return response.data;
  } catch (error) {
    console.error('Error fetching metrics:', error);
    console.warn('Using fallback metrics due to API error');
    return [
      { id: '1', name: 'Accuracy' },
      { id: '2', name: 'Completeness' },
      { id: '3', name: 'Relevance' }
    ];
  }
}

export { 
  getRecords, 
  setRecords, 
  getEvaluatorCases,
  getEvaluatorCasesWithDetails,
  testBackendConnection, 
  getAllEvaluators,
  getAllEvaluations,
  getAllCases,
  getUserDetails,
  isSupervisor,
  getMetrics,
  updateSingleEvaluation,
  getExistingEvaluations
}
