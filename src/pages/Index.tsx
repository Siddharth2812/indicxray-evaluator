import React, { useEffect, useState } from 'react'
import { Settings } from 'lucide-react'
import { ImageViewer } from '@/components/ImageViewer'
import { ReportPanel } from '@/components/ReportPanel'
import { EvaluationMetrics } from '@/components/EvaluationMetrics'
import { addEmptyMetrics, shuffle } from '@/lib/utils'
import { Record, Metric } from '@/types'
import useEvalutationStore from '@/stores/evaluation'
import { Button } from '@/components/ui/button'
import { setRecords, getMetrics, getUserDetails, getExistingEvaluations, updateSingleEvaluation } from '@/services'
import { useToast } from '@/hooks/use-toast'
import { useNavigate } from 'react-router-dom'

interface Props {
  records: Record[]
}

const Index = (props: Props) => {
  const { records } = props
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { toast } = useToast()
  const [doctorName, setDoctorName] = useState<string>('')
  const [metrics, setMetrics] = useState<Metric[]>([
    { id: '0', name: 'Loading...', description: 'Loading metrics...' }
  ])

  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const initId = useEvalutationStore((state) => state.initAtId)
  const doneForId = useEvalutationStore((state) => state.doneForId)
  const setDoneForId = useEvalutationStore((state) => state.setDoneForId)
  const resetDoneStatus = useEvalutationStore((state) => state.resetDoneStatus)
  const navigate = useNavigate()

  useEffect(() => {
    // Reset all evaluation data on initial load to ensure clean state
    console.log("Reset evaluation data on initial load");
    
    // Check if we need to force a reset
    const urlParams = new URLSearchParams(window.location.search);
    const forceReset = urlParams.get('force') === 'true';
    
    if (forceReset) {
      console.log("Forcing complete reset of evaluation store");
      resetDoneStatus();
      // Clear any evaluation data directly in the store
      useEvalutationStore.setState({
        evaluation: {},
        doneForId: {}
      });
      
      // Remove the force parameter from URL to prevent endless resets
      urlParams.delete('force');
      const newUrl = `${window.location.pathname}${urlParams.toString() ? `?${urlParams.toString()}` : ''}`;
      window.history.replaceState({}, document.title, newUrl);
      
      // Add a debug message to help track
      console.log("Evaluation store has been completely reset");
    }
  }, [resetDoneStatus]);

  useEffect(() => {
    const fetchMetrics = async () => {
      console.log("Starting metrics fetch");
      try {
        console.log("Calling getMetrics API");
        const metricsData = await getMetrics();
        console.log("Raw metrics data from API:", metricsData);
        
        if (!metricsData || metricsData.length === 0) {
          console.error("No metrics returned from API");
          toast({
            title: "Error",
            description: "No metrics found. Please contact support.",
            variant: "destructive",
          });
          return;
        }
        
        // Transform backend metrics to the format expected by the component
        const formattedMetrics: Metric[] = metricsData.map(metric => ({
          id: metric.id,
          name: metric.name,
          description: metric.description || ''
        }));
        
        console.log("Setting formatted metrics:", formattedMetrics);
        setMetrics(formattedMetrics);
        console.log("Fetched metrics from backend:", formattedMetrics);
      } catch (error) {
        console.error("Error fetching metrics:", error);
        toast({
          title: "Error",
          description: "Failed to load metrics from the backend",
          variant: "destructive",
        });
      }
    };
    
    console.log("Setting up metrics fetch");
    fetchMetrics();
  }, [toast]);

  // Fetch doctor name on component mount
  useEffect(() => {
    const fetchDoctorName = async () => {
      try {
        const urlParams = new URLSearchParams(window.location.search)
        const doctorId = urlParams.get('doctorId')
        
        if (doctorId) {
          const doctorDetails = await getUserDetails(doctorId)
          setDoctorName(doctorDetails.name || 'Unknown Doctor')
        }
      } catch (error) {
        console.error('Error fetching doctor name:', error)
        setDoctorName('Unknown Doctor')
      }
    }
    
    fetchDoctorName()
  }, [])

  // Ensure records are loaded before trying to access them
  if (!records || records.length === 0) {
    console.log("No records available");
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-medical-darkest-gray text-foreground">
        <p>Loading records...</p>
      </div>
    );
  }

  console.log("Records available:", records.length);
  
  const activeRecord = records[currentImageIndex]
  console.log("Active record:", activeRecord ? activeRecord.id : "none");
  
  const modelReports = activeRecord ? shuffle([...activeRecord.modelOutputs]) : []
  console.log("Model reports:", modelReports.length);
  
  console.log("Current metrics state:", metrics);
  console.log("Current active record evaluations:", activeRecord ? activeRecord.evaluations : "none");
  
  const modelScores = activeRecord ? activeRecord.evaluations.map(evaluation => ({
    responseId: evaluation.responseId,
    metrics: [{
      id: evaluation.metricId,
      name: metrics.find(m => m.id === evaluation.metricId)?.name || '',
      value: evaluation.score
    }]
  })) : [];
  
  console.log("Calculated model scores:", modelScores);

  // Initialize evaluations when metrics are loaded for the current record
  useEffect(() => {
    if (!activeRecord?.id || !activeRecord.modelOutputs || !metrics.length || metrics[0].id === '0') {
      return;
    }

    console.log("Starting evaluation initialization for record:", activeRecord.id);
    
    const initializeEvaluations = async () => {
      try {
        setIsSubmitting(true);
        
        // Fetch existing evaluations
        const existingEvaluations = await getExistingEvaluations(activeRecord.id);
        console.log("Fetched existing evaluations:", existingEvaluations);
        
        // Map the evaluations to the correct format
        const defaultScores = Array.from({ length: 3 }, (_, index) => {
          const output = activeRecord.modelOutputs[index];
          // Find existing evaluations for this model output
          const modelEvaluations = output ? existingEvaluations.filter(
            evaluation => evaluation.model_response === output.responseId
          ) : [];
          
          return {
            responseId: output?.responseId || `model-${index + 1}`,
            metrics: metrics.map(metric => {
              // Find existing evaluation for this metric
              const existingValue = modelEvaluations.find(
                evaluation => evaluation.metric === metric.id
              )?.score || null;
              
              return {
                id: metric.id,
                name: metric.name,
                description: metric.description,
                value: existingValue
              };
            })
          };
        });
        
        console.log("Initializing with scores:", defaultScores);
        initId(activeRecord.id, defaultScores);
        
      } catch (error) {
        console.error("Error initializing evaluation data:", error);
        toast({
          title: "Error",
          description: "Failed to initialize evaluation data. Please refresh the page.",
          variant: "destructive",
        });
      } finally {
        setIsSubmitting(false);
      }
    };

    initializeEvaluations();
  }, [metrics, activeRecord?.id, activeRecord?.modelOutputs, initId, toast]);

  const handleSubmit = async () => {
    if (!activeRecord?.id) return;
    
    setIsSubmitting(true);
    try {
      // Get evaluatorId from URL params
      const urlParams = new URLSearchParams(window.location.search);
      const evaluatorId = urlParams.get('doctorId');

      if (!evaluatorId) {
        throw new Error('No evaluator ID found');
      }

      // Get current evaluations from the store
      const currentEvaluations = useEvalutationStore.getState().evaluation[activeRecord.id];
      
      if (!currentEvaluations) {
        throw new Error('No evaluations found for submission');
      }

      // Submit each evaluation individually
      const submissionPromises = currentEvaluations.flatMap(evaluation => 
        evaluation.metrics
          .filter(metric => metric.value !== null && metric.value > 0)
          .map(metric => updateSingleEvaluation({
            caseId: activeRecord.id,
            responseId: evaluation.responseId,
            metricId: metric.id,
            evaluatorId,
            score: metric.value as number
          }))
      );

      const results = await Promise.all(submissionPromises);
      
      // Check the last result for the final status
      const lastResult = results[results.length - 1];
      
      if (lastResult.status === 'completed') {
        toast({
          title: "Success",
          description: "All evaluations submitted successfully",
        });
        setDoneForId(activeRecord.id, true);
      } else {
        toast({
          title: "Partial Success",
          description: `${lastResult.progress.completed} of ${lastResult.progress.total} evaluations completed`,
          variant: "default",
        });
      }
    } catch (error) {
      console.error("Error submitting evaluations:", error);
      toast({
        title: "Error",
        description: "Failed to submit evaluations. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBackClick = () => {
    const urlParams = new URLSearchParams(window.location.search)
    const doctorId = urlParams.get('doctorId')
    if (doctorId) {
      navigate(`/doctor/${doctorId}`)
    } else {
      // Fallback to home if no doctorId
      navigate('/')
    }
  }

  console.log({ activeRecord, modelReports, modelScores })

  return (
    <div className="h-screen flex flex-col bg-medical-darkest-gray text-foreground overflow-hidden">
      <header className="bg-medical-darker-gray px-8 py-3 border-b border-medical-dark-gray/30 flex justify-between items-center">
        <div className="flex items-center">
          <button 
            onClick={handleBackClick} 
            className="mr-4 hover:text-medical-blue transition-colors"
          >
            ← Back to Cases
          </button>
          <h1 className="text-xl font-bold text-medical-blue flex items-center">
            <Settings className="mr-2" size={20} />
            X-Ray AI Insights Hub
          </h1>
        </div>
        <div className="flex items-center">
          <p className="text-sm text-medical-gray">
            Doctor: {doctorName}
          </p>
        </div>
      </header>

      <div className="flex-1 flex flex-col p-4 space-y-4 overflow-auto">
        <div className="flex gap-4 h-[calc(60vh-2rem)]">
          <div className="w-2/5">
            <ImageViewer
              currentImage={activeRecord.imageUrl}
              currentIndex={0}
              totalImages={1}
              onChangeImage={() => {}}
            />
          </div>

          <div className="w-3/5 grid grid-cols-2 grid-rows-2 gap-4">
            <ReportPanel 
              isGroundTruth
              report={activeRecord.groundTruth}
            />
            {modelReports.map((report, index) => (
              <ReportPanel
                key={index}
                report={report}
                title={`MODEL ${index + 1}`}
              />
            ))}
          </div>
        </div>

        <div className="flex-1 min-h-[calc(40vh-6rem)] flex flex-col">
          <div className="flex-1 overflow-y-auto">
            <EvaluationMetrics
              activeRecordId={activeRecord.id || ''}
              metrics={metrics}
              isSubmitting={isSubmitting}
              modelResponses={Array.from({ length: 3 }, (_, index) => {
                const report = modelReports[index];
                return {
                  id: report?.responseId || `model-${index + 1}`,
                  model_name: `Model ${index + 1}`,
                  response: report || { responseId: `model-${index + 1}`, response: '' }
                };
              })}
            />
          </div>
          
          <div className="mt-4 flex justify-center">
            <Button 
              onClick={handleSubmit} 
              disabled={isSubmitting || metrics[0].id === '0' || !activeRecord?.id}
              className="bg-medical-blue hover:bg-medical-blue/90"
            >
              {isSubmitting ? "Submitting..." : 
               metrics[0].id === '0' ? "Loading Metrics..." : "Submit"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Index
