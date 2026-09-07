import express from 'express';
import path from 'path';
import fs from 'fs';
import Papa from 'papaparse';
import { google } from 'googleapis';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import nodemailer from 'nodemailer';

const app = express();
const PORT = 3000;
app.use(express.json({ limit: '10mb' }));

const DB_FILE = path.join(process.cwd(), 'leads_tracker.csv');
const JSON_DB_FILE = path.join(process.cwd(), 'leads_store.json');
const TEMPLATES_FILE = path.join(process.cwd(), 'templates.json');
const EMAILS_FILE = path.join(process.cwd(), 'emails.json');
const ACTIVITIES_FILE = path.join(process.cwd(), 'activities.json');
const CAMPAIGNS_FILE = path.join(process.cwd(), 'campaigns.json');
const SCHEDULED_QUEUE_FILE = path.join(process.cwd(), 'scheduled_queue.json');

if (!fs.existsSync(SCHEDULED_QUEUE_FILE)) {
    fs.writeFileSync(SCHEDULED_QUEUE_FILE, JSON.stringify([]));
}

function getScheduledEmails(): any[] {
    try {
        const data = fs.readFileSync(SCHEDULED_QUEUE_FILE, 'utf-8');
        return JSON.parse(data);
    } catch {
        return [];
    }
}

function saveScheduledEmails(emails: any[]) {
    try {
        fs.writeFileSync(SCHEDULED_QUEUE_FILE, JSON.stringify(emails, null, 2));
    } catch (e) {
        console.error('Failed to save scheduled queue:', e);
    }
}

const DEFAULT_CAMPAIGNS = [
  {
    id: "camp-coach-acquisition",
    name: "Coaching Client On-demand Acquisition",
    description: "3-step sequence covering DM organization + simple personal outreach check.",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    enrollmentCount: 0,
    steps: [
      {
        id: "step-fit-1",
        stepNumber: 1,
        delayDays: 0,
        subject: "Quick question for you, {{Name}}",
        body: "Hey {{Name}},\n\nAre you still manually managing your coaching leads, or do you have a system to keep track of who to follow up with?\n\nI build tailored lead-tracking workspaces specifically for coaches. It pulls your client inquiries into one dashboard so you always know exactly who needs a message today without digging through scattered Instagram DMs, sheets, or random notes.\n\nWould you be open to a quick look at a 2-minute walkthrough of the layout?\n\nBest,\n[My Name]\nCoach Growth OS"
      },
      {
        id: "step-fit-2",
        stepNumber: 2,
        delayDays: 3,
        subject: "Re: Quick question for you, {{Name}}",
        body: "Hey {{Name}},\n\nJust bumping this in case your inbox has been busy.\n\nI build custom lead trackers to help coaches focus purely on coaching while the system ensures follow-ups never slip through the cracks.\n\nLet me know if you'd like to take a look at the short demo.\n\nBest,\n[My Name]\nCoach Growth OS"
      },
      {
        id: "step-fit-3",
        stepNumber: 3,
        delayDays: 5,
        subject: "Closing the loop, {{Name}}?",
        body: "Hey {{Name}},\n\nLast message from me. If your current lead system is already working well, no worries at all.\n\nIf you ever want a simpler way to organize leads, follow-ups, booked calls, clients, and revenue, I’d be happy to show you what I’m building.\n\nBest,\n[My Name]\nCoach Growth OS"
      }
    ]
  },
  {
    id: "camp-pipeline-revamp",
    name: "Manual Tracker Recovery Campaign",
    description: "3-step system focused on recovering coaches lost in manual spreadsheets.",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    enrollmentCount: 0,
    steps: [
      {
        id: "step-bus-1",
        stepNumber: 1,
        delayDays: 0,
        subject: "{{Name}} — stopping lead leakage",
        body: "Hey {{Name}},\n\nI know how exhausting it is to balance actual coaching with the daily overhead of keeping track of prospective clients.\n\nI build custom, simple trackers for coaches that centralize incoming leads, schedule automated follow-up reminders, and keep your booked calls/revenue organized in one single view.\n\nIf you're currently managing things manually and want a clean, stress-free workspace built around your coaching flow, let me know if you'd like to check out a quick demo.\n\nBest,\n[My Name]\nCoach Growth OS"
      },
      {
        id: "step-bus-2",
        stepNumber: 2,
        delayDays: 3,
        subject: "Re: {{Name}} — stopping lead leakage",
        body: "Hey {{Name}},\n\nQuick bump here in case my previous note was lost in the shuffle.\n\nI design simple workspaces for coaches so they stop losing potential coaching clients to sloppy DM or spreadsheet tracking.\n\nLet me know if you are open to taking a look at a 3-minute video overview.\n\nBest,\n[My Name]\nCoach Growth OS"
      },
      {
        id: "step-bus-3",
        stepNumber: 3,
        delayDays: 5,
        subject: "Simpler coaching workflow?",
        body: "Hey {{Name}},\n\nNo pressure at all - if you're fully satisfied with your current DM/email outreach setup, feel free to ignore this!\n\nJust wanted to offer one final resource: a short, recorded video of how online business coaches are automating their check-ins and client tracking. If you'd like to check it out, let me know.\n\nBest,\n[My Name]\nCoach Growth OS"
      }
    ]
  }
];

const HEADERS = ['id', 'Name', 'Niche', 'Country', 'Email', 'Website', 'Status', 'Deal Value', 'Last Contact Date', 'Notes', 'Onboarding Stage'];

const DEFAULT_AGENCY_TEMPLATES = [
  {
    id: "tpl-direct-person",
    name: "Direct Pitch — Fitness Coach Focus",
    category: "Initial Pitch — Fitness Coach",
    subject: "Quick question for you, {{Name}}",
    body: "Hey {{Name}},\n\nAre you still manually managing your coaching leads, or do you have a system to keep track of who to follow up with?\n\nI build tailored lead-tracking workspaces specifically for coaches. It pulls your client inquiries into one dashboard so you always know exactly who needs a message today without digging through scattered Instagram DMs, sheets, or random notes.\n\nWould you be open to a quick look at a 2-minute walkthrough of the layout?\n\nBest,\n[My Name]\nCoach Growth OS",
    tags: ["direct", "personal", "fitness", "leads"]
  },
  {
    id: "tpl-pitch-help",
    name: "Help-First Pitch — General Coach Focus",
    category: "Initial Pitch — General Coach",
    subject: "{{Name}} — stopping lead leakage",
    body: "Hey {{Name}},\n\nI know how exhausting it is to balance actual coaching with the daily overhead of keeping track of prospective clients.\n\nI build custom, simple trackers for coaches that centralize incoming leads, schedule automated follow-up reminders, and keep your booked calls/revenue organized in one single view.\n\nIf you're currently managing things manually and want a clean, stress-free workspace built around your coaching flow, let me know if you'd like to check out a quick demo.\n\nBest,\n[My Name]\nCoach Growth OS",
    tags: ["coaching", "workspace", "general", "help-first"]
  },
  {
    id: "tpl-dm-fatigue",
    name: "DM Fatigue Pitch — Business Coach Focus",
    category: "Initial Pitch — Business Coach",
    subject: "A question about your lead flow, {{Name}}",
    body: "Hey {{Name}},\n\nMost coaches I speak with tell me they love the coaching, but absolutely hate the feeling of losing potential clients in their Instagram or email inbox because they forgot to follow up.\n\nI design custom CRM and follow-up boards for active coaches to make sure no prospect falls through the cracks.\n\nWould you be open to seeing a quick 3-minute video showing how it keeps lead flow organized and simple?\n\nBest,\n[My Name]\nCoach Growth OS",
    tags: ["dm-fatigue", "business", "organization", "leads"]
  },
  {
    id: "tpl-fu1-simple",
    name: "Follow-Up — Simple Check (No Reply)",
    category: "Follow-Up 1 — No Reply",
    subject: "Re: Quick question for you, {{Name}}",
    body: "Hey {{Name}},\n\nJust bumping this in case your inbox has been busy.\n\nI build custom lead trackers to help coaches focus purely on coaching while the system ensures follow-ups never slip through the cracks.\n\nLet me know if you'd like to take a look at the short demo.\n\nBest,\n[My Name]\nCoach Growth OS",
    tags: ["followup", "quick", "bump"]
  },
  {
    id: "tpl-fu2-stress",
    name: "Follow-Up — Low Pressure De-stressing",
    category: "Follow-Up 2 — Low-Pressure Follow-Up",
    subject: "Simpler coaching workflow?",
    body: "Hey {{Name}},\n\nNo pressure at all, but if managing client follow-ups across scattered spreadsheets and DMs is causing any headache, I'd be happy to show you how we solve that.\n\nIf not, feel free to ignore this and I wish you nothing but the best with your coaching!\n\nBest,\n[My Name]\nCoach Growth OS",
    tags: ["followup", "low-pressure"]
  },
  {
    id: "tpl-proposal-simple",
    name: "Custom Setup Proposal",
    category: "Proposal Follow-Up",
    subject: "Tailored coaching workspace for {{Name}}",
    body: "Hey {{Name}},\n\nGreat connecting! As promised, here is the direct scope for building your customized workspace:\n\n• Centralized lead pipeline tailored exactly to your client intake\n• Daily dashboard with automated follow-up alerts\n• Setup and data migration from your current sheets/notes\n• 30 days of direct support\n\nOne-time Setup: {{DealValue}}\n\nLet me know if this sounds good to you and if you'd like to get started this week!\n\nBest,\n[My Name]\nCoach Growth OS",
    tags: ["proposal", "pricing", "custom"]
  },
  {
    id: "tpl-onboarding-welcome",
    name: "Client Welcome & Onboarding",
    category: "Client Onboarding",
    subject: "Welcome, {{Name}}! Next steps for your workspace",
    body: "Hey {{Name}},\n\nThrilled to build your custom coaching CRM!\n\nHere are the 2 quick things to get us moving:\n\n1. Intake Details: Drop a list of your coaching packages and any current forms you use in a quick reply.\n2. Kickoff: Grab a 15-minute slot on my calendar so we can review the initial layout together: [Insert Booking Link]\n\nI'll have your initial system draft ready within 48–72 hours!\n\nBest,\n[My Name]\nCoach Growth OS",
    tags: ["onboarding", "welcome", "kickoff"]
  },
  {
    id: "tpl-breakup-person",
    name: "Closing the Loop (Sign-Off)",
    category: "Low-Pressure Sign-Off",
    subject: "Closing the loop for now, {{Name}}",
    body: "Hey {{Name}},\n\nI assume getting your lead pipeline and follow-up system streamlined isn't a top priority right now — completely understand!\n\nI'll close out your file so I don't clutter your inbox. If you ever find yourself spending too much time digging through inbox logs and spreadsheets in the future, feel free to reach back out.\n\nBest of luck with your coaching!\n\nBest,\n[My Name]\nCoach Growth OS",
    tags: ["breakup", "sign-off"]
  }
];

// Initialize DB if not exists
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, Papa.unparse({ fields: HEADERS, data: [] }));
}
if (!fs.existsSync(JSON_DB_FILE)) {
    fs.writeFileSync(JSON_DB_FILE, JSON.stringify([]));
}
if (!fs.existsSync(TEMPLATES_FILE)) {
    fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(DEFAULT_AGENCY_TEMPLATES, null, 2));
} else {
    try {
        const existing = JSON.parse(fs.readFileSync(TEMPLATES_FILE, 'utf-8'));
        if (!Array.isArray(existing) || existing.length === 0) {
            fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(DEFAULT_AGENCY_TEMPLATES, null, 2));
        }
    } catch (e) {
        fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(DEFAULT_AGENCY_TEMPLATES, null, 2));
    }
}
if (!fs.existsSync(EMAILS_FILE)) {
    fs.writeFileSync(EMAILS_FILE, JSON.stringify([]));
}
if (!fs.existsSync(ACTIVITIES_FILE)) {
    fs.writeFileSync(ACTIVITIES_FILE, JSON.stringify([]));
}
if (!fs.existsSync(CAMPAIGNS_FILE)) {
    fs.writeFileSync(CAMPAIGNS_FILE, JSON.stringify(DEFAULT_CAMPAIGNS, null, 2));
} else {
    try {
        const existing = JSON.parse(fs.readFileSync(CAMPAIGNS_FILE, 'utf-8'));
        if (!Array.isArray(existing) || existing.length === 0) {
            fs.writeFileSync(CAMPAIGNS_FILE, JSON.stringify(DEFAULT_CAMPAIGNS, null, 2));
        }
    } catch (e) {
        fs.writeFileSync(CAMPAIGNS_FILE, JSON.stringify(DEFAULT_CAMPAIGNS, null, 2));
    }
}

function getLeads(): any[] {
    // 1. Try reading from resilient JSON file first
    try {
        if (fs.existsSync(JSON_DB_FILE)) {
            const jsonStr = fs.readFileSync(JSON_DB_FILE, 'utf-8');
            const parsed = JSON.parse(jsonStr);
            if (Array.isArray(parsed) && parsed.length > 0) {
                return parsed.map((l: any) => ({ ...l, 'Onboarding Stage': l['Onboarding Stage'] || '' }));
            }
        }
    } catch (e) {
        console.error('Failed reading JSON leads store:', e);
    }

    // 2. Fallback to CSV file
    try {
        if (fs.existsSync(DB_FILE)) {
            const csvData = fs.readFileSync(DB_FILE, 'utf-8');
            const parsed = Papa.parse(csvData, { header: true, skipEmptyLines: true });
            if (Array.isArray(parsed.data) && parsed.data.length > 0) {
                return parsed.data.map((l: any) => ({ ...l, 'Onboarding Stage': l['Onboarding Stage'] || '' }));
            }
        }
    } catch (e) {
        console.error('Failed reading CSV leads tracker:', e);
    }

    return [];
}

function saveLeads(leads: any[]) {
    if (!Array.isArray(leads)) return;
    
    // Save to JSON store
    try {
        fs.writeFileSync(JSON_DB_FILE, JSON.stringify(leads, null, 2), 'utf-8');
    } catch (e) {
        console.error('Error writing leads_store.json:', e);
    }

    // Save to CSV store
    try {
        const csv = Papa.unparse({ fields: HEADERS, data: leads });
        fs.writeFileSync(DB_FILE, csv, 'utf-8');
    } catch (e) {
        console.error('Error writing leads_tracker.csv:', e);
    }
}

function getEmails() {
    try {
        const data = fs.readFileSync(EMAILS_FILE, 'utf-8');
        return JSON.parse(data);
    } catch {
        return [];
    }
}

function saveEmails(emails: any[]) {
    fs.writeFileSync(EMAILS_FILE, JSON.stringify(emails, null, 2));
}

function getActivities(): any[] {
    try {
        if (fs.existsSync(ACTIVITIES_FILE)) {
            const data = fs.readFileSync(ACTIVITIES_FILE, 'utf-8');
            const parsed = JSON.parse(data);
            if (Array.isArray(parsed)) return parsed;
        }
    } catch (e) {
        console.error('Failed reading activities:', e);
    }
    return [];
}

function saveActivities(activities: any[]) {
    try {
        fs.writeFileSync(ACTIVITIES_FILE, JSON.stringify(activities.slice(0, 200), null, 2), 'utf-8');
    } catch (e) {
        console.error('Failed saving activities:', e);
    }
}

function addActivityLog(type: string, title: string, details?: string, leadName?: string, leadId?: string) {
    try {
        const list = getActivities();
        const newAct = {
            id: Math.random().toString(36).substring(2, 9),
            type,
            title,
            details: details || '',
            leadName: leadName || '',
            leadId: leadId || '',
            timestamp: new Date().toISOString()
        };
        list.unshift(newAct);
        saveActivities(list);
        return newAct;
    } catch (e) {
        console.error('Error adding activity log:', e);
        return null;
    }
}

app.get('/api/leads', (req, res) => {
    res.json(getLeads());
});

app.get('/api/emails', (req, res) => {
    res.json(getEmails());
});

app.get('/api/activities', (req, res) => {
    res.json(getActivities());
});

app.post('/api/activities', (req, res) => {
    try {
        const { type, title, details, leadName, leadId } = req.body;
        if (!type || !title) {
            return res.status(400).json({ error: 'type and title are required' });
        }
        const created = addActivityLog(type, title, details, leadName, leadId);
        res.json({ success: true, activity: created });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/activities/clear', (req, res) => {
    try {
        saveActivities([]);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/leads', (req, res) => {
    try {
        if (!req.body || !Array.isArray(req.body.leads)) {
            return res.status(400).json({ error: 'Expected leads array in request body' });
        }
        saveLeads(req.body.leads);
        res.json({ success: true, count: req.body.leads.length });
    } catch (e: any) {
        console.error('Failed to save leads:', e);
        res.status(500).json({ error: e.message });
    }
});

// Resilient bidirectional sync endpoint
app.post('/api/leads/sync', (req, res) => {
    try {
        const incoming = req.body?.leads;
        if (!Array.isArray(incoming)) {
            return res.status(400).json({ error: 'Expected leads array' });
        }

        const current = getLeads();

        // If server is empty (e.g. after container restart), re-hydrate with incoming cache
        if (current.length === 0 && incoming.length > 0) {
            saveLeads(incoming);
            return res.json({ success: true, action: 'rehydrated', leads: incoming });
        }

        // If both have data, merge and deduplicate by id or email
        const mergedMap = new Map<string, any>();
        current.forEach((l: any) => {
            const key = (l.id || l.Email || '').toLowerCase();
            if (key) mergedMap.set(key, l);
            else mergedMap.set(Math.random().toString(36).substring(2, 9), l);
        });

        incoming.forEach((l: any) => {
            const key = (l.id || l.Email || '').toLowerCase();
            if (key) {
                // If existing, merge fields preferring incoming updates
                if (mergedMap.has(key)) {
                    mergedMap.set(key, { ...mergedMap.get(key), ...l });
                } else {
                    mergedMap.set(key, l);
                }
            } else {
                mergedMap.set(Math.random().toString(36).substring(2, 9), l);
            }
        });

        const merged = Array.from(mergedMap.values());
        saveLeads(merged);
        res.json({ success: true, action: 'merged', leads: merged });
    } catch (e: any) {
        console.error('Error syncing leads:', e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/leads/create', (req, res) => {
    try {
        const leadData = req.body.lead;
        const currentLeads = getLeads();
        const newLead = {
            id: Math.random().toString(36).substring(2, 9),
            Name: leadData.Name || 'New Prospect',
            Niche: leadData.Niche || '',
            Country: leadData.Country || '',
            Email: leadData.Email || '',
            Website: leadData.Website || '',
            Status: leadData.Status || 'New',
            'Deal Value': leadData['Deal Value'] || '0',
            'Last Contact Date': leadData['Last Contact Date'] || '',
            Notes: leadData.Notes || '',
            'Onboarding Stage': leadData['Onboarding Stage'] || ''
        };
        const updated = [newLead, ...currentLeads];
        saveLeads(updated);
        addActivityLog(
            'Lead Added',
            `Added prospect ${newLead.Name}`,
            `Niche: ${newLead.Niche || 'General'} · Value: $${newLead['Deal Value'] || '0'}`,
            newLead.Name,
            newLead.id
        );
        res.json({ success: true, lead: newLead, leads: updated });
    } catch (e: any) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/templates', (req, res) => {
    try {
        if (!fs.existsSync(TEMPLATES_FILE)) {
            fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(DEFAULT_AGENCY_TEMPLATES, null, 2));
            return res.json(DEFAULT_AGENCY_TEMPLATES);
        }
        const data = fs.readFileSync(TEMPLATES_FILE, 'utf-8');
        const parsed = JSON.parse(data);
        if (!Array.isArray(parsed) || parsed.length === 0) {
            fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(DEFAULT_AGENCY_TEMPLATES, null, 2));
            return res.json(DEFAULT_AGENCY_TEMPLATES);
        }
        // Ensure every template has a category
        const normalized = parsed.map((t: any) => ({
            ...t,
            category: t.category || 'General'
        }));
        res.json(normalized);
    } catch (e) {
        res.json(DEFAULT_AGENCY_TEMPLATES);
    }
});

app.post('/api/templates', (req, res) => {
    try {
        fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(req.body.templates, null, 2));
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/templates/reset', (req, res) => {
    try {
        fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(DEFAULT_AGENCY_TEMPLATES, null, 2));
        res.json({ success: true, templates: DEFAULT_AGENCY_TEMPLATES });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Campaigns Endpoints
app.get('/api/campaigns', (req, res) => {
    try {
        if (!fs.existsSync(CAMPAIGNS_FILE)) {
            fs.writeFileSync(CAMPAIGNS_FILE, JSON.stringify(DEFAULT_CAMPAIGNS, null, 2));
            return res.json(DEFAULT_CAMPAIGNS);
        }
        const data = fs.readFileSync(CAMPAIGNS_FILE, 'utf-8');
        const parsed = JSON.parse(data);
        res.json(parsed);
    } catch (e: any) {
        res.json(DEFAULT_CAMPAIGNS);
    }
});

app.post('/api/campaigns', (req, res) => {
    try {
        const campaign = req.body;
        let currentCampaigns = [];
        if (fs.existsSync(CAMPAIGNS_FILE)) {
            try {
                currentCampaigns = JSON.parse(fs.readFileSync(CAMPAIGNS_FILE, 'utf-8'));
            } catch (e) {}
        }
        
        const index = currentCampaigns.findIndex((c: any) => c.id === campaign.id);
        if (index >= 0) {
            currentCampaigns[index] = { ...currentCampaigns[index], ...campaign, updatedAt: new Date().toISOString() };
        } else {
            const newCamp = {
                id: campaign.id || `camp-${Date.now()}`,
                name: campaign.name || 'New Campaign',
                description: campaign.description || '',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                enrollmentCount: 0,
                steps: campaign.steps || []
            };
            currentCampaigns.push(newCamp);
        }
        
        fs.writeFileSync(CAMPAIGNS_FILE, JSON.stringify(currentCampaigns, null, 2));
        res.json({ success: true, campaigns: currentCampaigns });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/campaigns/:id', (req, res) => {
    try {
        const { id } = req.params;
        let currentCampaigns = [];
        if (fs.existsSync(CAMPAIGNS_FILE)) {
            try {
                currentCampaigns = JSON.parse(fs.readFileSync(CAMPAIGNS_FILE, 'utf-8'));
            } catch (e) {}
        }
        if (!currentCampaigns || currentCampaigns.length === 0) {
            currentCampaigns = JSON.parse(JSON.stringify(DEFAULT_CAMPAIGNS));
        }
        const updated = currentCampaigns.filter((c: any) => c.id !== id);
        fs.writeFileSync(CAMPAIGNS_FILE, JSON.stringify(updated, null, 2));

        // Clean up scheduled emails belonging to this campaign
        let scheduled = getScheduledEmails();
        const filteredScheduled = scheduled.filter((item: any) => item.campaignId !== id);
        saveScheduledEmails(filteredScheduled);

        res.json({ success: true, campaigns: updated, scheduledQueue: filteredScheduled });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/campaigns/reset', (req, res) => {
    try {
        fs.writeFileSync(CAMPAIGNS_FILE, JSON.stringify(DEFAULT_CAMPAIGNS, null, 2));
        res.json({ success: true, campaigns: DEFAULT_CAMPAIGNS });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/campaigns/enroll', (req, res) => {
    try {
        const { campaignId, count } = req.body;
        let currentCampaigns = [];
        if (fs.existsSync(CAMPAIGNS_FILE)) {
            try {
                currentCampaigns = JSON.parse(fs.readFileSync(CAMPAIGNS_FILE, 'utf-8'));
            } catch (e) {}
        }
        const index = currentCampaigns.findIndex((c: any) => c.id === campaignId);
        if (index >= 0) {
            currentCampaigns[index].enrollmentCount = (currentCampaigns[index].enrollmentCount || 0) + (count || 1);
            fs.writeFileSync(CAMPAIGNS_FILE, JSON.stringify(currentCampaigns, null, 2));
        }
        res.json({ success: true, campaigns: currentCampaigns });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// CSV Upload
app.post('/api/leads/csv-upload', (req, res) => {
    try {
        const { csvText } = req.body;
        const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
        const newLeads = parsed.data as any[];
        
        const currentLeads = getLeads();
        const existingEmails = new Set(currentLeads.map((l: any) => l.Email?.toLowerCase()).filter(Boolean));
        
        // Map imported fields to our schema
        const formattedNewLeads = newLeads.map(l => {
            const normalized: any = {};
            for (const key of Object.keys(l)) {
                normalized[key.trim().toLowerCase()] = typeof l[key] === 'string' ? l[key].trim() : l[key];
            }
            return {
                id: Math.random().toString(36).substring(2, 9),
                Name: normalized.name || normalized['full name'] || normalized['lead name'] || normalized['contact'] || '',
                Niche: normalized.niche || normalized.industry || normalized.category || '',
                Country: normalized.country || normalized.location || normalized.region || '',
                Email: normalized.email || normalized['email address'] || normalized['contact email'] || '',
                Website: normalized.website || normalized.url || normalized.link || normalized.domain || '',
                Status: 'New',
                'Deal Value': normalized['deal value'] || normalized.dealvalue || normalized.value || normalized.price || '',
                'Last Contact Date': '',
                Notes: normalized.notes || normalized.description || normalized.info || '',
                'Onboarding Stage': ''
            };
        }).filter(l => !l.Email || !existingEmails.has(l.Email.toLowerCase()));

        const merged = [...currentLeads, ...formattedNewLeads];
        saveLeads(merged);
        res.json({ success: true, leads: merged });
    } catch (e: any) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/leads/json-upload', (req, res) => {
    try {
        const { data } = req.body;
        const newLeads = data as any[];
        
        const currentLeads = getLeads();
        const existingEmails = new Set(currentLeads.map((l: any) => l.Email?.toLowerCase()).filter(Boolean));
        
        // Map imported fields to our schema
        const formattedNewLeads = newLeads.map(l => {
            const normalized: any = {};
            for (const key of Object.keys(l)) {
                normalized[key.trim().toLowerCase()] = typeof l[key] === 'string' ? l[key].trim() : l[key];
            }
            return {
                id: Math.random().toString(36).substring(2, 9),
                Name: normalized.name || normalized['full name'] || normalized['lead name'] || normalized['contact'] || '',
                Niche: normalized.niche || normalized.industry || normalized.category || '',
                Country: normalized.country || normalized.location || normalized.region || '',
                Email: normalized.email || normalized['email address'] || normalized['contact email'] || '',
                Website: normalized.website || normalized.url || normalized.link || normalized.domain || '',
                Status: 'New',
                'Deal Value': normalized['deal value'] || normalized.dealvalue || normalized.value || normalized.price || '',
                'Last Contact Date': '',
                Notes: normalized.notes || normalized.description || normalized.info || '',
                'Onboarding Stage': ''
            };
        }).filter(l => !l.Email || !existingEmails.has(l.Email.toLowerCase()));

        const merged = [...currentLeads, ...formattedNewLeads];
        saveLeads(merged);
        res.json({ success: true, leads: merged });
    } catch (e: any) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/leads/:id', (req, res) => {
    try {
        const { id } = req.params;
        const currentLeads = getLeads();
        const filtered = currentLeads.filter((l: any) => l.id !== id);
        saveLeads(filtered);
        res.json({ success: true, leads: filtered });
    } catch (e: any) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/leads/clear', (req, res) => {
    try {
        saveLeads([]);
        res.json({ success: true, leads: [] });
    } catch (e: any) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// AI Generation Helper with Resilient Model Fallback
async function generateWithFallback(ai: GoogleGenAI, config: any) {
    const models = ['gemini-3.1-flash-lite', 'gemini-flash-latest', 'gemini-3.8-flash'];
    let lastError: any = null;
    for (const model of models) {
        try {
            return await ai.models.generateContent({
                ...config,
                model
            });
        } catch (err: any) {
            lastError = err;
            console.warn(`Model ${model} error, trying fallback...`, err?.message || err);
            continue;
        }
    }
    throw lastError;
}

// AI Email Generator
app.post('/api/generate-email', async (req, res) => {
    try {
        const { lead, leadName, niche, tone, context, observation, goal } = req.body;
        
        if (!process.env.GEMINI_API_KEY) {
            return res.status(400).json({ error: 'GEMINI_API_KEY is missing' });
        }

        const targetLead = lead || {
            Name: leadName || 'Coach',
            BusinessName: leadName || 'Coaching Business',
            Niche: niche || 'Online Coaching',
            PersonalizedObservation: observation || '',
            Notes: context || ''
        };

        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        
        const observationText = (targetLead.PersonalizedObservation || observation || context || targetLead.Notes || '').trim();
        
        if (!observationText) {
             return res.json({ 
               success: true, 
               draft: { 
                 subject: 'Needs Research', 
                 body: 'Needs research before sending. Add a real observation about this coach’s content, offer, website, or lead process.' 
               } 
             });
        }

        const prompt = `You are writing an outreach email for "Coach Growth OS".
Coach Growth OS is a done-for-you service for online fitness coaches, personal trainers, and business coaches.
We build customized lead-management dashboards and follow-up systems around the way their coaching business already works, so they stop losing leads in Instagram DMs and messy spreadsheets, follow up consistently, and know exactly who to contact next.

Target Prospect:
Name: ${targetLead.Name || 'Coach'}
Business/Brand Name: ${targetLead.BusinessName || targetLead.Name || 'Coaching Business'}
Niche: ${targetLead.Niche || 'Fitness / Business Coaching'}
Country: ${targetLead.Country || 'Unknown'}
Website/Profile: ${targetLead.Website || targetLead.ProfileURL || ''}
Personalized Observation: ${observationText}
Tone/Angle: ${tone || 'Respectful, natural, low-pressure'}

CRITICAL RULES:
1. Message must be short, human, relevant, respectful, and low-pressure. Never use pushy sales language or marketing hype.
2. Structure:
   - A genuine personalized observation based on their real content, offer, or website detail (provided in Personalized Observation).
   - Explain that we build customized lead-management and follow-up systems for coaches to keep inquiries from Instagram, forms, and DMs organized and show who needs a follow-up today.
   - Mention that we are working with a small number of coaches at a founder rate ($600–$1,000 setup) while refining the system around real coaching workflows.
   - Soft CTA: Ask if they would be open to taking a look at a short demo of the workflow.
3. NEVER invent or hallucinate observations, follower counts, revenue numbers, or testimonials.
4. NEVER promise guaranteed clients, guaranteed sales, or specific revenue increases.
5. DO NOT use words related to video editing, clipping, UGC, creators, podcasts, viral clips, or content repurposing.
6. If the Personalized Observation is missing, vague, or empty, return exactly:
{"subject": "Needs Research", "body": "Needs research before sending. Add a real observation about this coach’s content, offer, website, or lead process."}
7. Output strictly valid JSON with keys "subject" and "body" (plain text body with \\n linebreaks, no markdown, no HTML).
`;

        const response = await generateWithFallback(ai, {
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });

        res.json({ success: true, draft: JSON.parse(response.text || '{}') });
    } catch (e: any) {
        console.error("AI Gen Error:", e);
        res.status(500).json({ error: e.message });
    }
});

// Intake Assistant
app.post('/api/intake', async (req, res) => {
    try {
        const { rawText } = req.body;
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const prompt = `You are a CRM data entry assistant. Extract lead information from the following text and return it as a JSON array of objects. 
Each object must have these exact keys: 'id' (generate a random short string), 'Name', 'Niche', 'Country', 'Email', 'Website', 'Status' (set to 'New'), 'Deal Value' (extract numbers or set to '0'), 'Last Contact Date' (empty string), 'Notes'.
If some fields are missing, make your best guess or leave them empty.

Text:
${rawText}`;

        const response = await generateWithFallback(ai, {
            contents: prompt,
            config: {
                responseMimeType: "application/json",
            }
        });

        const newLeads = JSON.parse(response.text || '[]');
        const currentLeads = getLeads();
        
        // Deduplicate by email
        const existingEmails = new Set(currentLeads.map((l: any) => l.Email?.toLowerCase()).filter(Boolean));
        const filteredNewLeads = newLeads.filter((l: any) => !l.Email || !existingEmails.has(l.Email.toLowerCase()));

        const merged = [...currentLeads, ...filteredNewLeads];
        saveLeads(merged);
        res.json({ success: true, leads: merged });
    } catch (e: any) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// AI Leads Niche Classifier
app.post('/api/leads/classify-niches', async (req, res) => {
    try {
        if (!process.env.GEMINI_API_KEY) {
            return res.status(400).json({ error: 'GEMINI_API_KEY is missing' });
        }

        const leads = getLeads();
        if (leads.length === 0) {
            return res.json({ success: true, leads, classifiedCount: 0 });
        }

        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        
        // Pick only fields relevant to niche to minimize prompt size
        const leadsDataToClassify = leads.map((l: any) => ({
            id: l.id,
            Name: l.Name,
            BusinessName: l.BusinessName || '',
            Niche: l.Niche || '',
            Notes: l.Notes || '',
            Website: l.Website || ''
        }));

        const prompt = `You are an AI data classification expert. Analyze the list of coaching leads and classify each lead's niche into one of these exact values: "Fitness Coach" or "Business Coach".
If a lead is clearly focused on physical fitness, personal training, athletics, weight loss, yoga, bodybuilding, coaching athletes, or health coaching, classify them as "Fitness Coach".
If a lead is focused on business growth, marketing, sales, mindset for entrepreneurs, executive performance, finance, agency building, corporate consulting, or scaling systems, classify them as "Business Coach".
If it is ambiguous, analyze their website, business name or name hints to make your best guess. Ensure you classify EVERY item in the array.

Input list of leads:
${JSON.stringify(leadsDataToClassify, null, 2)}

Return your answer as a JSON array of objects, each with exactly two keys: "id" and "classifiedNiche" (which must be either "Fitness Coach" or "Business Coach").
Example response schema:
[
  { "id": "lead-1", "classifiedNiche": "Fitness Coach" }
]`;

        const response = await generateWithFallback(ai, {
            contents: prompt,
            config: {
                responseMimeType: "application/json",
            }
        });

        const classifications = JSON.parse(response.text || '[]');
        let classifiedCount = 0;

        if (Array.isArray(classifications)) {
            const classMap = new Map<string, string>();
            for (const item of classifications) {
                if (item && item.id && (item.classifiedNiche === 'Fitness Coach' || item.classifiedNiche === 'Business Coach')) {
                    classMap.set(item.id, item.classifiedNiche);
                }
            }

            for (const lead of leads) {
                if (classMap.has(lead.id)) {
                    lead.Niche = classMap.get(lead.id);
                    classifiedCount++;
                }
            }
            saveLeads(leads);
        }

        addActivityLog(
            'Status Changed',
            `AI classified ${classifiedCount} leads`,
            `Niches analyzed and updated to 'Fitness Coach' or 'Business Coach' automatically.`,
            'AI Classifier'
        );

        res.json({ success: true, leads, classifiedCount });
    } catch (e: any) {
        console.error("AI Niche classification error:", e);
        res.status(500).json({ error: e.message });
    }
});

// Gmail Send
app.post('/api/gmail/send', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ error: 'No auth token' });
        const token = authHeader.split(' ')[1];

        const { leadId, email, subject, body } = req.body;
        const isSandbox = (token === 'sandbox_token' || token === 'mock_token' || token === 'null' || !token);

        let leadName = 'Unknown';
        const leads = getLeads();
        const lead = leads.find((l: any) => l.id === leadId);
        if (lead) {
            leadName = lead.Name || email;
        }

        let simulated = false;
        let warning = '';

        if (!isSandbox) {
            try {
                const oauth2Client = new google.auth.OAuth2();
                oauth2Client.setCredentials({ access_token: token });
                const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

                // Construct raw email
                const message = [
                    `To: ${email}`,
                    'Content-Type: text/html; charset=utf-8',
                    'MIME-Version: 1.0',
                    `Subject: ${subject}`,
                    '',
                    body
                ].join('\n');

                const encodedMessage = Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

                await gmail.users.messages.send({
                    userId: 'me',
                    requestBody: { raw: encodedMessage }
                });
            } catch (gmailErr: any) {
                console.warn("Gmail API Send failed, falling back to Sandbox simulation:", gmailErr.message || gmailErr);
                simulated = true;
                warning = `Gmail Send simulated: Google API returned error "${gmailErr.message || gmailErr}". The email was processed as a successful simulated send in Sandbox Mode.`;
            }
        } else {
            simulated = true;
            warning = 'Email successfully simulated via Sandbox Mode.';
        }

        // Update lead status
        if (lead) {
            lead.Status = 'Emailed';
            lead['Last Contact Date'] = new Date().toISOString().split('T')[0];
            saveLeads(leads);
        }

        const emailsLog = getEmails();
        emailsLog.push({
            id: Math.random().toString(36).substring(2, 9),
            leadId,
            leadName: leadName,
            emailAddress: email,
            subject,
            body,
            type: 'sent',
            date: new Date().toISOString(),
            simulated
        });
        saveEmails(emailsLog);

        addActivityLog(
            'Email Sent',
            `${simulated ? '[Simulated] ' : ''}Outreach sent to ${leadName}`,
            `Subject: ${subject}`,
            leadName,
            leadId
        );

        res.json({ success: true, leads, simulated, warning });
    } catch (e: any) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// Helper to extract body from Gmail message payload
function getGmailMessageBody(part: any): string {
    if (!part) return '';
    if (part.body && part.body.data) {
        return Buffer.from(part.body.data, 'base64').toString('utf-8');
    }
    if (part.parts) {
        // Try to find plain text first
        const plainTextPart = part.parts.find((p: any) => p.mimeType === 'text/plain');
        if (plainTextPart) {
            return getGmailMessageBody(plainTextPart);
        }
        // Fallback to html or other parts
        for (const subPart of part.parts) {
            const body = getGmailMessageBody(subPart);
            if (body) return body;
        }
    }
    return '';
}

// GET /api/gmail/thread
app.get('/api/gmail/thread', async (req, res) => {
    try {
        const { email } = req.query;
        if (!email) {
            return res.status(400).json({ error: 'Email parameter is required' });
        }

        const authHeader = req.headers.authorization;
        const token = authHeader ? authHeader.split(' ')[1] : null;
        const isSandbox = !token || token === 'sandbox_token' || token === 'mock_token' || token === 'null';

        if (isSandbox) {
            // Return simulated or local store emails for this email address to keep the interface working in sandbox
            const emailsLog = getEmails();
            const filtered = emailsLog.filter((e: any) => e.emailAddress.toLowerCase().trim() === (email as string).toLowerCase().trim());
            return res.json({ success: true, messages: filtered, simulated: true });
        }

        try {
            const oauth2Client = new google.auth.OAuth2();
            oauth2Client.setCredentials({ access_token: token });
            const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

            // Search messages sent to or received from the lead email
            const searchResponse = await gmail.users.messages.list({
                userId: 'me',
                q: `to:${email} OR from:${email}`,
                maxResults: 50
            });

            const messagesSummary = searchResponse.data.messages || [];
            const messagesDetails: any[] = [];

            for (const msg of messagesSummary) {
                const msgDetail = await gmail.users.messages.get({
                    userId: 'me',
                    id: msg.id!,
                    format: 'full'
                });

                const headers = msgDetail.data.payload?.headers || [];
                const fromHeader = headers.find(h => h.name?.toLowerCase() === 'from')?.value || '';
                const toHeader = headers.find(h => h.name?.toLowerCase() === 'to')?.value || '';
                const subjectHeader = headers.find(h => h.name?.toLowerCase() === 'subject')?.value || 'No Subject';
                const dateHeader = headers.find(h => h.name?.toLowerCase() === 'date')?.value || new Date().toISOString();

                // Determine if sent by "me" (authenticated user) or by the lead
                const isSentByMe = !fromHeader.toLowerCase().includes((email as string).toLowerCase());
                const type = isSentByMe ? 'sent' : 'received';

                // Extract body using our recursive helper
                const rawBody = getGmailMessageBody(msgDetail.data.payload);
                // Simple clean up of rawBody (trim extra whitespace, maybe strip HTML if it looks like rich HTML)
                let cleanBody = rawBody.trim();
                if (cleanBody.toLowerCase().includes('<body') || cleanBody.toLowerCase().includes('<div') || cleanBody.toLowerCase().includes('<p')) {
                    // Extract text inside html safely or strip tags simple way
                    cleanBody = cleanBody.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                                         .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                                         .replace(/<[^>]+>/g, ' ')
                                         .replace(/\s+/g, ' ')
                                         .trim();
                }

                messagesDetails.push({
                    id: msg.id,
                    emailAddress: (email as string).toLowerCase(),
                    subject: subjectHeader,
                    body: cleanBody || '(No message body content)',
                    type,
                    date: new Date(dateHeader).toISOString(),
                    simulated: false
                });
            }

            // Sort messages oldest to newest (ascending time) so it reads chronologically
            const sortedMessages = messagesDetails.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

            return res.json({ success: true, messages: sortedMessages, simulated: false });
        } catch (gmailErr: any) {
            console.error(`Gmail thread fetch failed for ${email}:`, gmailErr);
            // Fallback to local logs on API error so it never crashes
            const emailsLog = getEmails();
            const filtered = emailsLog.filter((e: any) => e.emailAddress.toLowerCase().trim() === (email as string).toLowerCase().trim());
            return res.json({ success: true, messages: filtered, simulated: true, error: gmailErr.message });
        }
    } catch (e: any) {
        console.error("API error in thread fetch:", e);
        res.status(500).json({ error: e.message });
    }
});

// Gmail Scan
app.post('/api/gmail/scan', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader ? authHeader.split(' ')[1] : null;
        const isSandbox = (token === 'sandbox_token' || token === 'mock_token' || token === 'null' || !token);

        const runSandboxScan = () => {
            const leads = getLeads();
            const emailedLeads = leads.filter((l: any) => l.Status === 'Emailed' && l.Email);
            
            if (emailedLeads.length > 0) {
                const leadToReply = emailedLeads[0];
                leadToReply.Status = 'Replied';
                leadToReply['Last Contact Date'] = new Date().toISOString().split('T')[0];
                saveLeads(leads);
                
                const emailsLog = getEmails();
                emailsLog.push({
                    id: Math.random().toString(36).substring(2, 9),
                    messageId: 'mock_' + Math.random().toString(36).substring(2, 9),
                    emailAddress: leadToReply.Email.toLowerCase(),
                    subject: 'Re: Quick question about your coaching lead flow',
                    body: "Hey, thanks for reaching out. Yes, I'd love to see a quick 3-minute video overview of how this system works. Let me know when you have some time! Thanks.",
                    type: 'received',
                    date: new Date().toISOString(),
                    simulated: true
                });
                saveEmails(emailsLog);
                
                addActivityLog(
                    'Status Changed',
                    `Lead ${leadToReply.Name || leadToReply.Email} replied to email (Sandbox)`,
                    `Status automatically updated to 'Replied' and logged in Inbox`,
                    leadToReply.Name || leadToReply.Email,
                    leadToReply.id
                );
                
                return res.json({ success: true, leads, simulated: true, foundRepliedLead: leadToReply.Name });
            }
            
            return res.json({ success: true, leads, simulated: true, foundRepliedLead: null, message: 'No un-replied "Emailed" leads found to simulate responses for.' });
        };

        if (isSandbox) {
            return runSandboxScan();
        }

        try {
            const oauth2Client = new google.auth.OAuth2();
            oauth2Client.setCredentials({ access_token: token });
            const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

            // Find unread messages
            const response = await gmail.users.messages.list({
                userId: 'me',
                q: 'is:unread',
                maxResults: 20
            });

            const messages = response.data.messages || [];
            const senders = new Set<string>();
            const emailsLog = getEmails();
            let logUpdated = false;

            for (const msg of messages) {
                const detail = await gmail.users.messages.get({
                    userId: 'me',
                    id: msg.id!,
                    format: 'metadata',
                    metadataHeaders: ['From', 'Subject']
                });
                const headers = detail.data.payload?.headers;
                const fromHeader = headers?.find(h => h.name === 'From')?.value;
                const subjHeader = headers?.find(h => h.name === 'Subject')?.value || 'No Subject';
                
                if (fromHeader) {
                    const match = fromHeader.match(/<([^>]+)>/);
                    const email = match ? match[1] : fromHeader;
                    const cleanEmail = email.toLowerCase();
                    senders.add(cleanEmail);
                    
                    const existing = emailsLog.find((e: any) => e.messageId === msg.id);
                    if (!existing) {
                        emailsLog.push({
                            id: Math.random().toString(36).substring(2, 9),
                            messageId: msg.id,
                            emailAddress: cleanEmail,
                            subject: subjHeader,
                            body: 'Received a reply. Check your inbox.',
                            type: 'received',
                            date: new Date().toISOString()
                        });
                        logUpdated = true;
                    }
                }
            }

            if (logUpdated) saveEmails(emailsLog);

            // Update leads
            const leads = getLeads();
            let updated = false;
            for (const lead of leads) {
                if (lead.Email && senders.has(lead.Email.toLowerCase()) && lead.Status !== 'Closed Won' && lead.Status !== 'Closed Lost') {
                    lead.Status = 'Replied';
                    updated = true;
                }
            }

            if (updated) {
                saveLeads(leads);
            }

            res.json({ success: true, leads, simulated: false });
        } catch (gmailErr: any) {
            // Fallback cleanly to sandbox scan when live API credentials are invalid or expired
            return runSandboxScan();
        }
    } catch (e: any) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/chat', async (req, res) => {
    try {
        const { message, history } = req.body;
        
        if (!process.env.GEMINI_API_KEY) {
            return res.status(400).json({ error: 'GEMINI_API_KEY is missing' });
        }
        
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        
        const systemInstruction = `You are the Coach Growth OS Copilot, an expert agency assistant for Coach Growth OS.
Coach Growth OS is a done-for-you service for online fitness coaches and business coaches. We build customized lead-management dashboards and follow-up systems around the way each coach's business already works, so they stop losing leads in Instagram DMs and messy spreadsheets, follow up consistently, and know exactly who to contact next.

Key Facts & Positioning:
- Target clients: Online fitness coaches, personal trainers, nutrition coaches, online business coaches, executive coaches, mindset & performance coaches.
- Core offer: Customized lead pipeline, centralized inquiries (Instagram, forms, website, DMs), follow-up reminders, and revenue/client tracking.
- Founder pricing: $600–$1,000 USD one-time setup, optional $50–$100 USD/mo hosting, monitoring, and updates.
- Positioning: "I'm working with a small number of fitness and business coaches at a founder rate while I refine the system around real coaching workflows."
- Outreach purpose: Start a respectful conversation, show a short demo, book a discovery call, and sell a customized setup.
- Core problems solved: Lost leads across DMs and spreadsheets, inconsistent follow-up, scattered notes, manual admin, lack of sales pipeline clarity.
- No video, UGC, clipping, creator, podcast, or content-repurposing language.
- Never invent observations about a prospect. Always advise the operator to add real observations from the coach's content, offer, or website.
- Never invent fake testimonials, case studies, or revenue guarantees.
- Always use Google Search when asked to research specific coaches, gym owners, or business consulting profiles.
- Keep outreach copy short, human, natural, and low pressure.`;

        // Format contents
        const contents = [];
        if (history && Array.isArray(history)) {
            contents.push(...history);
        }
        contents.push({ role: 'user', parts: [{ text: message }] });

        const response = await generateWithFallback(ai, {
            contents,
            config: {
                systemInstruction,
                tools: [{ googleSearch: {} }],
            }
        });
        
        res.json({ success: true, text: response.text });
    } catch (e: any) {
        console.error("Chat Error:", e);
        res.status(500).json({ error: e.message || "Failed to process chat" });
    }
});

// Scheduled Emails Queue Endpoints
app.get('/api/scheduled-emails', (req, res) => {
    try {
        const emails = getScheduledEmails();
        res.json({ success: true, emails });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/scheduled-emails', (req, res) => {
    try {
        const { emails } = req.body;
        if (Array.isArray(emails)) {
            saveScheduledEmails(emails);
            res.json({ success: true, emails });
        } else {
            res.status(400).json({ error: 'Invalid scheduled emails array' });
        }
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Manual Send Now
app.post('/api/scheduled/:id/send-now', (req, res) => {
    try {
        const { id } = req.params;
        const queue = getScheduledEmails();
        const email = queue.find((e: any) => e.id === id);
        
        if (!email) {
            return res.status(404).json({ error: 'Scheduled email not found' });
        }
        
        email.scheduledAt = new Date().toISOString(); // Trigger immediately
        email.status = 'Scheduled';
        delete email.error;
        
        saveScheduledEmails(queue);
        res.json({ success: true, email });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Reschedule
app.post('/api/scheduled/:id/reschedule', (req, res) => {
    try {
        const { id } = req.params;
        const { scheduledAt } = req.body;
        const queue = getScheduledEmails();
        const email = queue.find((e: any) => e.id === id);
        
        if (!email) {
            return res.status(404).json({ error: 'Scheduled email not found' });
        }
        
        email.scheduledAt = scheduledAt;
        email.status = 'Scheduled';
        delete email.error;
        
        saveScheduledEmails(queue);
        res.json({ success: true, email });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Server-side 24/7 Background Scheduler Loop (runs on Cloud Run 24/7 even when laptop is closed)
setInterval(async () => {
    try {
        const queue = getScheduledEmails();
        if (!queue || queue.length === 0) return;

        const now = new Date();
        let queueUpdated = false;

        for (const email of queue) {
            if (email.status === 'Scheduled' && new Date(email.scheduledAt) <= now) {
                
                let actuallySent = false;
                let failedMsg = null;

                if (process.env.SMTP_USER && process.env.SMTP_PASS) {
                    try {
                        const transporter = nodemailer.createTransport({
                            service: 'gmail',
                            auth: {
                                user: process.env.SMTP_USER,
                                pass: process.env.SMTP_PASS
                            }
                        });
                        await transporter.sendMail({
                            from: process.env.SMTP_USER,
                            to: email.emailAddress,
                            subject: email.subject,
                            text: email.body, // Fallback text version
                            html: email.body.replace(/\n/g, '<br>') // Convert newlines to HTML breaks
                        });
                        actuallySent = true;
                        console.log(`[SMTP] Successfully sent scheduled email to ${email.emailAddress}`);
                    } catch (err: any) {
                        console.warn("[SMTP] Failed to send scheduled email (Handled):", err.message);
                        failedMsg = err.message || 'Unknown SMTP Error';
                    }
                } else {
                    console.warn("[SMTP] No credentials provided, falling back to Sandbox simulation for background scheduled email.");
                    actuallySent = true; // Treated as sent for sandbox simulation
                }

                if (failedMsg) {
                    email.status = 'Failed';
                    email.error = failedMsg;
                    queueUpdated = true;
                } else {
                    email.status = 'Sent';
                    queueUpdated = true;

                    // Update lead last contact date in leads store
                    const leads = getLeads();
                    const lead = leads.find((l: any) => l.id === email.leadId);
                    let leadName = email.leadName || 'Prospect';
                    if (lead) {
                        lead.Status = 'Emailed';
                        lead['Last Contact Date'] = new Date().toISOString().split('T')[0];
                        leadName = lead.Name || leadName;
                        saveLeads(leads);
                    }

                    // Log email to sent emails
                    const emailsLog = getEmails();
                    emailsLog.push({
                        id: Math.random().toString(36).substring(2, 9),
                        leadId: email.leadId,
                        leadName,
                        emailAddress: email.emailAddress,
                        subject: email.subject,
                        body: email.body,
                        type: 'sent',
                        date: new Date().toISOString(),
                        simulated: !process.env.SMTP_USER // It's simulated if we have no SMTP config
                    });
                    saveEmails(emailsLog);

                    // Add activity log
                    addActivityLog(
                        'Email Sent',
                        `${!process.env.SMTP_USER ? '[Simulated] ' : ''}[24/7 Background] Scheduled email sent to ${leadName}`,
                        `Subject: ${email.subject}`,
                        leadName,
                        email.leadId
                    );
                }
            }
        }

        if (queueUpdated) {
            saveScheduledEmails(queue);
        }
    } catch (err) {
        console.error("Server background scheduler error:", err);
    }
}, 30000); // Check every 30 seconds

// Vite Middleware
async function startServer() {
    if (process.env.NODE_ENV !== "production") {
        const vite = await createViteServer({
            server: { middlewareMode: true },
            appType: "spa",
        });
        app.use(vite.middlewares);
    } else {
        const distPath = path.join(process.cwd(), 'dist');
        app.use(express.static(distPath));
        app.get('*', (req, res) => {
            res.sendFile(path.join(distPath, 'index.html'));
        });
    }

    app.listen(PORT, "0.0.0.0", () => {
        console.log(`Server running on port ${PORT}`);
    });
}
startServer();
