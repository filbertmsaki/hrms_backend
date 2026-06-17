import { INestApplication } from '@nestjs/common';
import { OpenAPIObject } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';

export const SCALAR_DOCS_PATH = '/api-documentation';

type ScalarOperation = {
  method?: string;
  path?: string;
  operation?: {
    tags?: string[];
  };
  tags?: string[];
};

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
      operationsSorter: (a: ScalarOperation, b: ScalarOperation) => {
        const getMethod = (op: ScalarOperation): string =>
          String(op?.method ?? '').toLowerCase();
        const getPath = (op: ScalarOperation): string => String(op?.path ?? '');
        const hasPathParam = (path: string): boolean => /\{[^}]+\}/.test(path);
        const crudRank = (op: ScalarOperation): number => {
          const method = getMethod(op);
          const path = getPath(op);

          if (method === 'post') return 10;
          if (method === 'get' && !hasPathParam(path)) return 20;
          if (method === 'get' && hasPathParam(path)) return 30;
          if (method === 'put' || method === 'patch') return 40;
          if (method === 'delete') return 50;

          const fallbackRank: Record<string, number> = {
            options: 60,
            head: 70,
            trace: 80,
          };
          return fallbackRank[method] ?? 999;
        };

        const rankA = crudRank(a);
        const rankB = crudRank(b);
        if (rankA !== rankB) return rankA - rankB;

        const pathA = getPath(a);
        const pathB = getPath(b);
        if (pathA !== pathB) return pathA.localeCompare(pathB);

        const methodRank: Record<string, number> = {
          post: 10,
          get: 20,
          put: 40,
          patch: 40,
          delete: 50,
          options: 60,
          head: 70,
          trace: 80,
        };
        const methodRankA = methodRank[getMethod(a)] ?? 999;
        const methodRankB = methodRank[getMethod(b)] ?? 999;
        return methodRankA - methodRankB;
      },
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
