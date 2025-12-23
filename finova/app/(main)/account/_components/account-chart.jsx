"use client"

import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { endOfDay, endOfToday, startOfDay, startOfToday, subDays } from 'date-fns';
import React, { useMemo, useState } from 'react'
import { Area, Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from 'recharts'

const DATE_RANGES = {
    "7D": {label: "Last 7 Days", days:7},
    "1M": {label: "Last Month", days:30},
    "3M": {label: "Last 3 Months", days:90},
    "6M": {label: "Last 6 Months", days:180},
    "1Y": {label: "Last Year", days:365},
    ALL: {label: "All Time", days: null},
};

const AccountChart = ({transactions}) => {
    const [dataRange, setDataRange] = useState("1M");
        

    const filteredData = useMemo(()=>{
        const range = DATE_RANGES[dateRange];
        const now = new Date();
        const startDate = range.days
            ? startOfToday(subDays(now, range.days))
            :startOfDay(new Date(0));

        // Filter transactions within date range
        const filtered = transactions.filter(
            (t) => new Date(t.date) >= startDate && new Date(t.date) <= endOfToday(now)
        );

        const grouped = filtered.reduce((acc,transaction)=>{
            const date = format(new Date(transaction.date), "MMM dd");

            if (!acc[date]){
                acc[date] = { date, income: 0, expense: 0};
            }

            if (transaction.type === "INCOME"){
                acc[date].income += transaction.amount;
            }
            else{
                acc[date].expense += transaction.amount;
            }

            return acc;

        },[]);

        // COnvert to array and sort by date
        return Object.values(grouped).sort(
            (a,b) => new Date(a.date) - new Date(b.date)
        );

    },[transactions, dateRange]);

    const totals = useMemo(() => {
        return filteredData.reduce(
            (acc,day) => ({
                income: acc.income + day.income,
                expense: acc.expense + day.expense,
            }),
            {income: 0, expense: 0}
        );
    }, [filteredData]);

  return (
    <Card>
        <CardHeader className={"flex flex-row items-center justify-between space-y-0 pb-7"}>
            <CardTitle className={"text-base font-normal"}> Transaction Overview
            </CardTitle>
            <Select defaultValue={dataRange} onValueChange={setDateRange}>
                <SelectTrigger className="w-35">
                    <SelectValue placeholder="Select range" />
                </SelectTrigger>
                <SelectContent>
                    {Object.entries(DATE_RANGES).map(([key,{label}])=>{
                        return (
                            <SelectItem key={key} value={key}>
                                {label}
                            </SelectItem>
                        );
                    })}
                </SelectContent>
            </Select>
        </CardHeader>
        <CardContent> 

        <div className='flex justify-around mb-6 text-sm'>
            <div className='text-center'>
                <p className='text-muted-foreground'>
                    Total Income</p>
                <p className='text-lg font-bold text-green-500'>₹{totals.income.toFixed(2)}</p>
            </div>
            <div className='text-center'>
                <p className='text-muted-foreground'>
                    Total Expenses</p>
                <p className='text-lg font-bold text-red-500'>₹{totals.expense.toFixed(2)}</p>
            </div>
            <div className='text-center'>
                <p className='text-muted-foreground'>
                    Net</p>
                <p 
                    className='text-lg font-bold ₹{
                        totals.income - totals.expense >= 0
                        ? "text-green-500"
                        : "text-red-500" 
                    }'
                >
                    ₹{(totals.income - totals.expense).toFixed(2)}</p>
            </div>
        </div>  
        <div className='h-75'>

                <ComposedChart
                    style={{ width: '100%', maxWidth: '700px', maxHeight: '70vh', aspectRatio: 1.618 }}
                    responsive
                    data={filteredData}
                    margin={{
                        top: 10,
                        right: 10,
                        bottom: 0,
                        left: 10,    
                    }}
                    >
                    <CartesianGrid stroke="#f5f5f5" vertical={false}/>
                    <XAxis dataKey="date" scale="band" />
                    <YAxis 
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => '$₹{value}' } />
                    <Tooltip formatter={(value) => ['$₹{value}', undefined]} />
                    <Legend />
                    <Area type="monotone" dataKey="amt" fill="#8884d8" stroke="#8884d8" />
                    <Bar 
                        dataKey="income" 
                        name="Income"
                        radius={[4,4,0,0]} 
                        fill="#22c55e" />
                    <Bar 
                        dataKey="expense" 
                        name="Expense"
                        radius={[4,4,0,0]}
                        fill="#ef4444" />
                    <Line type="monotone" dataKey="uv" stroke="#ff7300" />
                    <Scatter dataKey="cnt" fill="red" />
                    <RechartsDevtools />
                </ComposedChart>
        </div>
        </CardContent>
        <CardFooter>
            <p>Card Footer</p>
        </CardFooter>
    </Card>

    
  )
}

export default AccountChart
