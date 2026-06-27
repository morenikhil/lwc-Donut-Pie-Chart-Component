/**
 * DonutChartController
 *
 * Apex controller for the donutChart LWC component.
 *
 * Provides:
 *  - getChartData  : generic wire-compatible method (driven by recordId context)
 *  - getOpportunityStageData  : sample — Opp revenue grouped by Stage
 *  - getCaseStatusData        : sample — Cases grouped by Status
 *  - getAccountIndustryData   : sample — Accounts grouped by Industry
 *
 * All methods return List<ChartDataItem> which the component understands via
 * the default labelField='label' / valueField='value' mapping.
 */
public with sharing class DonutChartController {

    // ── Inner wrapper ──────────────────────────────────────────────────────

    public class ChartDataItem {
        @AuraEnabled public String label  { get; set; }
        @AuraEnabled public Decimal value { get; set; }

        public ChartDataItem(String label, Decimal value) {
            this.label = label;
            this.value = value;
        }
    }

    // ── Generic entry point (wire-compatible) ──────────────────────────────

    /**
     * Generic wire method called when the component has a recordId.
     * Dispatches to an Opportunity stage breakdown by default.
     * Override or extend to support different sObject types.
     */
    @AuraEnabled(cacheable=true)
    public static List<ChartDataItem> getChartData(String recordId) {
        // When no recordId is provided, return org-wide Opp stage totals.
        if (String.isBlank(recordId)) {
            return getOpportunityStageData();
        }

        // Example: if recordId is an Account, return related Opp breakdown
        String objectType = resolveObjectType(recordId);
        if (objectType == 'Account') {
            return getOpportunityStageDataForAccount(recordId);
        }

        return getOpportunityStageData();
    }

    // ── Sample data methods ────────────────────────────────────────────────

    /** Opportunities grouped by Stage — summed by Amount. */
    @AuraEnabled(cacheable=true)
    public static List<ChartDataItem> getOpportunityStageData() {
        List<ChartDataItem> items = new List<ChartDataItem>();

        for (AggregateResult ar : [
            SELECT StageName stage, SUM(Amount) total
            FROM   Opportunity
            WHERE  IsClosed = false
              AND  Amount != null
            GROUP  BY StageName
            ORDER  BY SUM(Amount) DESC
            LIMIT  10
        ]) {
            String stageName = (String)  ar.get('stage');
            Decimal amount   = (Decimal) ar.get('total');
            items.add(new ChartDataItem(stageName, amount));
        }

        return items;
    }

    /** Cases grouped by Status — counted. */
    @AuraEnabled(cacheable=true)
    public static List<ChartDataItem> getCaseStatusData() {
        List<ChartDataItem> items = new List<ChartDataItem>();

        for (AggregateResult ar : [
            SELECT Status status, COUNT(Id) cnt
            FROM   Case
            GROUP  BY Status
            ORDER  BY COUNT(Id) DESC
            LIMIT  10
        ]) {
            String status = (String)  ar.get('status');
            Decimal count = (Decimal) ar.get('cnt');
            items.add(new ChartDataItem(status, count));
        }

        return items;
    }

    /** Accounts grouped by Industry — counted. */
    @AuraEnabled(cacheable=true)
    public static List<ChartDataItem> getAccountIndustryData() {
        List<ChartDataItem> items = new List<ChartDataItem>();

        for (AggregateResult ar : [
            SELECT Industry industry, COUNT(Id) cnt
            FROM   Account
            WHERE  Industry != null
            GROUP  BY Industry
            ORDER  BY COUNT(Id) DESC
            LIMIT  10
        ]) {
            String industry = (String)  ar.get('industry');
            Decimal count   = (Decimal) ar.get('cnt');
            items.add(new ChartDataItem(industry != null ? industry : 'Other', count));
        }

        return items;
    }

    /** Opportunities grouped by Stage for a specific Account. */
    @AuraEnabled(cacheable=true)
    public static List<ChartDataItem> getOpportunityStageDataForAccount(Id accountId) {
        List<ChartDataItem> items = new List<ChartDataItem>();

        for (AggregateResult ar : [
            SELECT StageName stage, SUM(Amount) total
            FROM   Opportunity
            WHERE  AccountId = :accountId
              AND  Amount    != null
            GROUP  BY StageName
            ORDER  BY SUM(Amount) DESC
            LIMIT  10
        ]) {
            String stageName = (String)  ar.get('stage');
            Decimal amount   = (Decimal) ar.get('total');
            items.add(new ChartDataItem(stageName, amount));
        }

        return items;
    }

    // ── Utility ────────────────────────────────────────────────────────────

    private static String resolveObjectType(String recordId) {
        try {
            Id recId = (Id) recordId;
            return recId.getSObjectType().getDescribe().getName();
        } catch (Exception e) {
            return '';
        }
    }
}
