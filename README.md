# Punch Clock - Time Tracking PWA

A simple, fast PWA for tracking work hours via NFC/QR codes with offline support.

## Features

- ⏰ **Quick Punch In/Out** - Tap NFC or scan QR to log time instantly
- 🔄 **Smart Rounding** - Round times to nearest 5, 10, or 15 minutes
- 📊 **Dashboard** - View hours per day, monthly stats, and insights
- 💰 **Earnings Calculator** - Set hourly rate to see earnings and forecasts
- 📱 **PWA/A2HS** - Install as app on iOS and Android
- 📤 **Excel Export** - Export monthly timesheets
- 🔒 **Privacy-First** - All data stored locally on device (IndexedDB)

## Tech Stack

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- IndexedDB (via idb library)
- Recharts for visualizations
- xlsx for Excel export

## Getting Started

### Install Dependencies

```bash
npm install
```

### Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Build for Production

```bash
npm run build
```

## Deploy to Vercel

1. Push to GitHub
2. Import project in Vercel
3. Deploy (no configuration needed)

## NFC/QR Setup

Create NFC tags or QR codes with these URLs:

- **Arrival**: `https://your-app.vercel.app/?action=arrival`
- **Departure**: `https://your-app.vercel.app/?action=departure`

When scanned, the app will open directly to the time entry form with the correct mode selected.

## Add to Home Screen (A2HS)

### iOS Safari
1. Tap the Share button
2. Scroll down and tap "Add to Home Screen"
3. Tap "Add"

### Android Chrome
1. Tap menu (three dots)
2. Tap "Add to Home screen"
3. Tap "Add"

## Data Storage

All data is stored locally using IndexedDB:
- **No server database needed** - Works offline
- **No limits** - Unlike Supabase free tier
- **Private** - Data never leaves your device
- **Fast** - No network latency

## License

MIT
