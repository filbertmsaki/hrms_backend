import { INestApplication } from '@nestjs/common';
import { OpenAPIObject } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';

export const SCALAR_DOCS_PATH = '/api-documentation';

export function setupScalarDocumentation(
  app: INestApplication,
  document: OpenAPIObject,
): void {
  app.use(
    SCALAR_DOCS_PATH,
    apiReference({
      pageTitle: 'HRMS API Documentation',
      title: 'HRMS API Reference',
      content: document,
      theme: 'bluePlanet',
      layout: 'modern',
      darkMode: true,
      hideDarkModeToggle: false,
      showSidebar: true,
      hideSearch: false,
      defaultOpenFirstTag: true,
      operationTitleSource: 'summary',
      showOperationId: true,
      persistAuth: true,
      hideTestRequestButton: false,
      documentDownloadType: 'both',
      withDefaultFonts: true,
      metaData: {
        title: 'HRMS API Documentation',
        description:
          'Interactive documentation for HRMS backend modules and workflows.',
      },
      customCss: `
        .light-mode {
          --scalar-color-accent: #0f766e;
          --scalar-button-1: #0f766e;
          --scalar-button-1-color: #ffffff;
          --scalar-button-1-hover: #115e59;
        }
        .dark-mode {
          --scalar-color-accent: #14b8a6;
          --scalar-button-1: #14b8a6;
          --scalar-button-1-color: #042f2e;
          --scalar-button-1-hover: #2dd4bf;
        }
      `,
    }),
  );
}
