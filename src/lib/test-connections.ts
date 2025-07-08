import { auth, db } from './firebase';
import { supabase } from './supabase';
import { signInAnonymously } from 'firebase/auth';
import { collection, addDoc } from 'firebase/firestore';

export async function testFirebaseConnection() {
  try {
    console.log('Testing Firebase connection...');
    
    // Test authentication
    const userCredential = await signInAnonymously(auth);
    console.log('✅ Firebase Auth working:', userCredential.user.uid);
    
    // Test Firestore
    const testDoc = await addDoc(collection(db, 'test'), {
      message: 'Test connection',
      timestamp: new Date()
    });
    console.log('✅ Firebase Firestore working:', testDoc.id);
    
    // Clean up test document
    // Note: In production, you'd want to delete this test document
    
    return { success: true, message: 'Firebase connection successful' };
  } catch (error) {
    console.error('❌ Firebase connection failed:', error);
    return { success: false, message: 'Firebase connection failed', error };
  }
}

export async function testSupabaseConnection() {
  try {
    console.log('Testing Supabase connection...');
    
    // Test storage bucket access
    const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
    
    if (bucketError) {
      throw bucketError;
    }
    
    console.log('✅ Supabase Storage working:', buckets);
    
    // Check if resumes bucket exists
    const resumesBucket = buckets?.find(bucket => bucket.name === 'resumes');
    if (!resumesBucket) {
      console.warn('⚠️ Resumes bucket not found. Make sure to create it.');
    } else {
      console.log('✅ Resumes bucket found');
    }
    
    return { success: true, message: 'Supabase connection successful' };
  } catch (error) {
    console.error('❌ Supabase connection failed:', error);
    return { success: false, message: 'Supabase connection failed', error };
  }
}

export async function testOpenAIConnection() {
  try {
    console.log('Testing OpenAI connection...');
    
    // Test OpenAI API through server route
    const response = await fetch('/api/test-openai');
    const result = await response.json();
    
    if (result.success) {
      console.log('✅ OpenAI API working:', result.response);
      return { success: true, message: 'OpenAI connection successful' };
    } else {
      throw new Error(result.error || 'OpenAI test failed');
    }
  } catch (error) {
    console.error('❌ OpenAI connection failed:', error);
    return { success: false, message: 'OpenAI connection failed', error };
  }
}

export async function testAllConnections() {
  console.log('🔍 Testing all connections...');
  
  const firebaseResult = await testFirebaseConnection();
  const supabaseResult = await testSupabaseConnection();
  const openaiResult = await testOpenAIConnection();
  
  const allSuccessful = firebaseResult.success && supabaseResult.success && openaiResult.success;
  
  if (allSuccessful) {
    console.log('🎉 All connections successful!');
  } else {
    console.log('❌ Some connections failed. Check the errors above.');
  }
  
  return {
    firebase: firebaseResult,
    supabase: supabaseResult,
    openai: openaiResult,
    allSuccessful
  };
} 