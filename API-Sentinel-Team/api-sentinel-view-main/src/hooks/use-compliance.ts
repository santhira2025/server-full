import { useQuery, useMutation } from '@tanstack/react-query';
import { fetchComplianceReport, generateReportPDF } from '@/services/testing.service';

export function useComplianceReport(framework: string = 'OWASP_API_2023') {
    return useQuery({
        queryKey: ['compliance', 'report', framework],
        queryFn: ({ signal }) => fetchComplianceReport(framework, signal),
        staleTime: 5_000,
        refetchInterval: 5_000,
    });
}

export function useGenerateExport() {
    return useMutation({
        mutationFn: ({ framework, format }: { framework: string; format: string }) =>
            generateReportPDF(framework, format),
    });
}
