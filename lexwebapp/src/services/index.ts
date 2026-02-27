/**
 * Services Index
 * Export all services from a single entry point
 */

export { authService } from './api/AuthService';
export { billingService } from './api/BillingService';
export { clientService } from './api/ClientService';
export { mcpService } from './api/MCPService';

// Export service classes for testing
export { AuthService } from './api/AuthService';
export { BillingService } from './api/BillingService';
export { ClientService } from './api/ClientService';
export { MCPService } from './api/MCPService';

// Upload service
export { UploadService, uploadService } from './api/UploadService';

// Upload manager
export { UploadManager, uploadManager } from './upload/UploadManager';

// Workflow service
export { WorkflowService, workflowService } from './api/WorkflowService';

// Attorney & Consultation services
export { AttorneyService, attorneyService } from './api/AttorneyService';
export { ConsultationService, consultationService } from './api/ConsultationService';
